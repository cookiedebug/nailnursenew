from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import date, datetime, time, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

import click
from flask import Flask, g, jsonify, request
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
    create_engine,
    select,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, scoped_session, sessionmaker
from werkzeug.security import check_password_hash, generate_password_hash

COOKIE_NAME = "nailnurse_session"
SESSION_DAYS = 7
DEFAULT_START = time(9, 0)
DEFAULT_END = time(18, 0)
SERVICES: dict[str, int] = {
    "Acrylics": 110,
    "Builder gel": 90,
    "Gel X": 105,
    "Gel Stick ons": 90,
    "Manicure": 60,
}


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('client', 'admin')", name="valid_user_role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="client")
    accepted_terms: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LoginSession(Base):
    __tablename__ = "login_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class Availability(Base):
    __tablename__ = "availability"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    available: Mapped[bool] = mapped_column(Boolean, nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    admin_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'cancelled')",
            name="valid_appointment_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    service: Mapped[str] = mapped_column(String(40), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="booked")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_date(value: Any) -> date | None:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == value else None


def parse_time(value: Any) -> time | None:
    if not isinstance(value, str) or not re.fullmatch(r"\d{2}:\d{2}", value):
        return None
    try:
        return time.fromisoformat(value)
    except ValueError:
        return None


def public_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
    }


def availability_payload(record: Availability | None, requested_date: date) -> dict[str, Any]:
    return {
        "date": requested_date.isoformat(),
        "available": bool(record and record.available),
        "start_time": record.start_time.strftime("%H:%M") if record and record.start_time else None,
        "end_time": record.end_time.strftime("%H:%M") if record and record.end_time else None,
    }


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    default_db = Path(__file__).parent / "instance" / "nailnurse.sqlite3"
    default_db.parent.mkdir(parents=True, exist_ok=True)
    app.config.from_mapping(
        DATABASE_URL=os.getenv("DATABASE_URL", f"sqlite:///{default_db.as_posix()}"),
        SECRET_KEY=os.getenv("SECRET_KEY", secrets.token_hex(32)),
        FRONTEND_ORIGIN=os.getenv("FRONTEND_ORIGIN", "http://localhost:3000"),
        COOKIE_SECURE=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        SESSION_COOKIE_SAMESITE="Lax",
    )
    if test_config:
        app.config.update(test_config)

    frontend_origins = {app.config["FRONTEND_ORIGIN"]}
    local_frontend_origins = {"http://localhost:3000", "http://127.0.0.1:3000"}
    if app.config["FRONTEND_ORIGIN"] in local_frontend_origins:
        frontend_origins.update(local_frontend_origins)

    engine = create_engine(
        app.config["DATABASE_URL"],
        connect_args={"check_same_thread": False, "timeout": 20}
        if app.config["DATABASE_URL"].startswith("sqlite")
        else {},
    )
    factory = scoped_session(sessionmaker(bind=engine, expire_on_commit=False))
    Base.metadata.create_all(engine)
    app.extensions["db_session"] = factory

    def db():
        return factory()

    @app.teardown_appcontext
    def remove_session(_error: BaseException | None = None) -> None:
        factory.remove()

    @app.before_request
    def enforce_origin_and_load_user():
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("Origin")
            if origin not in frontend_origins:
                return jsonify(error="Request origin is not allowed."), 403

        g.current_user = None
        token = request.cookies.get(COOKIE_NAME)
        if token:
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            stored = db().scalar(
                select(LoginSession).where(
                    LoginSession.token_hash == token_hash,
                    LoginSession.expires_at > utc_now(),
                )
            )
            if stored:
                g.current_user = db().get(User, stored.user_id)

    @app.after_request
    def set_security_headers(response):
        origin = request.headers.get("Origin")
        if origin in frontend_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, OPTIONS"
            response.headers["Vary"] = "Origin"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    def require_user(role: str | None = None):
        def decorator(function: Callable):
            @wraps(function)
            def wrapped(*args, **kwargs):
                user = g.current_user
                if user is None:
                    return jsonify(error="Please sign in to continue."), 401
                if role and user.role != role:
                    return jsonify(error="You are not authorized to access this resource."), 403
                return function(*args, **kwargs)

            return wrapped

        return decorator

    def set_login_cookie(response, user: User):
        raw_token = secrets.token_urlsafe(32)
        db().add(
            LoginSession(
                token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
                user_id=user.id,
                created_at=utc_now(),
                expires_at=utc_now() + timedelta(days=SESSION_DAYS),
            )
        )
        db().commit()
        response.set_cookie(
            COOKIE_NAME,
            raw_token,
            httponly=True,
            secure=app.config["COOKIE_SECURE"],
            samesite=app.config["SESSION_COOKIE_SAMESITE"],
            max_age=SESSION_DAYS * 24 * 60 * 60,
            path="/",
        )
        return response

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    @app.post("/api/auth/register")
    def register():
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return jsonify(error="Provide account details in a JSON object."), 400
        full_name_value = payload.get("full_name", "")
        email_value = payload.get("email", "")
        phone_value = payload.get("phone", "")
        password = payload.get("password", "")
        if not all(isinstance(value, str) for value in (full_name_value, email_value, phone_value)):
            return jsonify(error="Name, email, and phone number must be text."), 400
        full_name = full_name_value.strip()
        email = email_value.strip().lower()
        phone = phone_value.strip()
        accepted_terms = payload.get("accepted_terms") is True
        if not full_name or len(full_name) > 120:
            return jsonify(error="Enter your full name (up to 120 characters)."), 400
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
            return jsonify(error="Enter a valid email address."), 400
        if email == "admin@nailnurse.com":
            return jsonify(error="That email is reserved for the studio administrator."), 409
        if not re.fullmatch(r"[+()\d\s-]{7,32}", phone):
            return jsonify(error="Enter a valid phone number."), 400
        if not isinstance(password, str) or len(password) < 12:
            return jsonify(error="Your password must be at least 12 characters."), 400
        if not accepted_terms:
            return jsonify(error="Please agree to the booking policies and terms."), 400
        user = User(
            full_name=full_name,
            email=email,
            phone=phone,
            password_hash=generate_password_hash(password),
            role="client",
            accepted_terms=True,
            created_at=utc_now(),
        )
        db().add(user)
        try:
            db().commit()
        except IntegrityError:
            db().rollback()
            return jsonify(error="An account with that email already exists."), 409
        return set_login_cookie(jsonify(user=public_user(user)), user), 201

    @app.post("/api/auth/login")
    def login():
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return jsonify(error="Provide sign-in details in a JSON object."), 400
        email_value = payload.get("email", "")
        password = payload.get("password", "")
        if not isinstance(email_value, str):
            return jsonify(error="Email or password is incorrect."), 401
        email = email_value.strip().lower()
        user = db().scalar(select(User).where(User.email == email))
        if not user or not isinstance(password, str) or not check_password_hash(
            user.password_hash, password
        ):
            return jsonify(error="Email or password is incorrect."), 401
        return set_login_cookie(jsonify(user=public_user(user)), user)

    @app.get("/api/auth/me")
    @require_user()
    def current_user():
        return jsonify(user=public_user(g.current_user))

    @app.post("/api/auth/logout")
    def logout():
        token = request.cookies.get(COOKIE_NAME)
        if token:
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            stored = db().scalar(select(LoginSession).where(LoginSession.token_hash == token_hash))
            if stored:
                db().delete(stored)
                db().commit()
        response = jsonify(message="You have been signed out.")
        response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="Lax")
        return response

    @app.get("/api/availability")
    def get_public_availability():
        requested = parse_date(request.args.get("date"))
        if requested is None:
            return jsonify(error="Provide a valid date in YYYY-MM-DD format."), 400
        session = db()
        record = session.scalar(select(Availability).where(Availability.date == requested))
        booked = session.scalars(
            select(Appointment)
            .where(
                Appointment.date == requested,
                Appointment.status.in_(("pending", "confirmed")),
            )
            .order_by(Appointment.start_time)
        ).all()
        response = availability_payload(record, requested)
        response["booked_slots"] = [
            {
                "start_time": appointment.start_time.strftime("%H:%M"),
                "end_time": appointment.end_time.strftime("%H:%M"),
            }
            for appointment in booked
        ]
        return jsonify(availability=response)

    @app.get("/api/availability/calendar")
    def get_public_availability_calendar():
        month_text = request.args.get("month", "")
        match = re.fullmatch(r"(\d{4})-(0[1-9]|1[0-2])", month_text)
        if not match:
            return jsonify(error="Provide a valid month in YYYY-MM format."), 400
        year, month = int(match.group(1)), int(match.group(2))
        if year < 1 or year >= 9999:
            return jsonify(error="Provide a supported calendar month."), 400
        month_start = date(year, month, 1)
        month_end = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
        session = db()
        records = session.scalars(
            select(Availability)
            .where(
                Availability.available.is_(True),
                Availability.date >= max(month_start, datetime.now(timezone.utc).date()),
                Availability.date < month_end,
            )
            .order_by(Availability.date)
        ).all()
        open_dates = [record.date for record in records]
        booked = session.scalars(
            select(Appointment)
            .where(
                Appointment.date.in_(open_dates) if open_dates else False,
                Appointment.status.in_(("pending", "confirmed")),
            )
            .order_by(Appointment.date, Appointment.start_time)
        ).all()
        booked_by_date: dict[date, list[dict[str, str]]] = {}
        for appointment in booked:
            booked_by_date.setdefault(appointment.date, []).append(
                {
                    "start_time": appointment.start_time.strftime("%H:%M"),
                    "end_time": appointment.end_time.strftime("%H:%M"),
                }
            )
        return jsonify(
            dates=[
                {
                    **availability_payload(record, record.date),
                    "booked_slots": booked_by_date.get(record.date, []),
                }
                for record in records
            ]
        )

    @app.get("/api/admin/availability/<date_text>")
    @require_user("admin")
    def get_admin_availability(date_text: str):
        requested = parse_date(date_text)
        if requested is None:
            return jsonify(error="Provide a valid date in YYYY-MM-DD format."), 400
        session = db()
        record = session.scalar(select(Availability).where(Availability.date == requested))
        appointment_count = session.query(Appointment).filter(
            Appointment.date == requested,
            Appointment.status.in_(("pending", "confirmed")),
        ).count()
        return jsonify(
            availability=availability_payload(record, requested),
            appointment_count=appointment_count,
        )

    @app.put("/api/admin/availability/<date_text>")
    @require_user("admin")
    def update_admin_availability(date_text: str):
        requested = parse_date(date_text)
        if requested is None:
            return jsonify(error="Provide a valid date in YYYY-MM-DD format."), 400
        if requested < datetime.now(timezone.utc).date():
            return jsonify(error="You cannot change availability for a past date."), 400
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload.get("available"), bool):
            return jsonify(error="Choose available or unavailable."), 400
        start_value, end_value = payload.get("start_time"), payload.get("end_time")
        if bool(start_value) != bool(end_value):
            return jsonify(error="Provide both opening and closing times, or leave both blank."), 400
        start_time = parse_time(start_value) if start_value else None
        end_time = parse_time(end_value) if end_value else None
        if start_value and (start_time is None or end_time is None):
            return jsonify(error="Times must use the 24-hour HH:MM format."), 400
        if start_time and end_time and start_time >= end_time:
            return jsonify(error="The closing time must be after the opening time."), 400

        session = db()
        record = session.scalar(select(Availability).where(Availability.date == requested))
        appointment_count = session.query(Appointment).filter(
            Appointment.date == requested,
            Appointment.status.in_(("pending", "confirmed")),
        ).count()
        desired = payload["available"]
        if record and record.available and not desired and appointment_count:
            if payload.get("confirm_existing") is not True:
                return jsonify(
                    error="There are existing appointments on this date.",
                    requires_confirmation=True,
                    appointment_count=appointment_count,
                ), 409

        now = utc_now()
        if record is None:
            record = Availability(
                date=requested,
                available=desired,
                start_time=start_time,
                end_time=end_time,
                created_at=now,
                updated_at=now,
                admin_user_id=g.current_user.id,
            )
            session.add(record)
        else:
            record.available = desired
            record.start_time = start_time
            record.end_time = end_time
            record.updated_at = now
            record.admin_user_id = g.current_user.id
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            return jsonify(error="Availability for this date could not be saved. Please reload."), 409
        return jsonify(
            availability=availability_payload(record, requested),
            appointment_count=appointment_count,
            message="Availability updated.",
        )

    @app.get("/api/bookings")
    @require_user("client")
    def get_client_bookings():
        today = datetime.now(timezone.utc).date()
        appointments = db().scalars(
            select(Appointment)
            .where(
                Appointment.client_user_id == g.current_user.id,
                Appointment.date >= today,
            )
            .order_by(Appointment.date, Appointment.start_time)
        ).all()
        return jsonify(
            bookings=[
                {
                    "id": appointment.id,
                    "date": appointment.date.isoformat(),
                    "service": appointment.service,
                    "start_time": appointment.start_time.strftime("%H:%M"),
                    "end_time": appointment.end_time.strftime("%H:%M"),
                    "duration_minutes": appointment.duration_minutes,
                    "status": appointment.status,
                }
                for appointment in appointments
            ]
        )

    @app.post("/api/bookings")
    @require_user("client")
    def create_booking():
        payload = request.get_json(silent=True) or {}
        requested = parse_date(payload.get("date"))
        service = payload.get("service")
        start_time = parse_time(payload.get("start_time"))
        if requested is None:
            return jsonify(error="Choose a valid appointment date."), 400
        if requested < datetime.now(timezone.utc).date():
            return jsonify(error="You cannot book an appointment in the past."), 400
        if service not in SERVICES:
            return jsonify(error="Choose one of the listed services."), 400
        if start_time is None:
            return jsonify(error="Choose a valid appointment time."), 400
        session = db()
        availability = session.scalar(
            select(Availability).where(Availability.date == requested)
        )
        if not availability or not availability.available:
            return jsonify(
                error="The nail technician is unavailable on this date.",
                unavailable=True,
            ), 409

        opens = availability.start_time or DEFAULT_START
        closes = availability.end_time or DEFAULT_END
        duration = SERVICES[service]
        start_minutes = start_time.hour * 60 + start_time.minute
        open_minutes = opens.hour * 60 + opens.minute
        end_minutes = start_minutes + duration
        close_minutes = closes.hour * 60 + closes.minute
        if start_minutes < open_minutes or end_minutes > close_minutes:
            return jsonify(error="That service does not fit within the available hours."), 400
        if (start_minutes - open_minutes) % 30 != 0:
            return jsonify(error="Choose an offered 30-minute appointment start time."), 400
        now = datetime.now(timezone.utc)
        if requested == now.date() and start_time <= now.time().replace(tzinfo=None):
            return jsonify(error="Choose a future appointment time."), 400

        end_time = (datetime.combine(requested, start_time) + timedelta(minutes=duration)).time()
        existing = session.scalars(
            select(Appointment).where(
                Appointment.date == requested,
                Appointment.status.in_(("pending", "confirmed")),
            )
        ).all()
        for appointment in existing:
            existing_start = appointment.start_time.hour * 60 + appointment.start_time.minute
            existing_end = appointment.end_time.hour * 60 + appointment.end_time.minute
            if start_minutes < existing_end and end_minutes > existing_start:
                return jsonify(error="That time has just been booked. Please choose another."), 409

        appointment = Appointment(
            client_user_id=g.current_user.id,
            service=service,
            date=requested,
            start_time=start_time,
            end_time=end_time,
            duration_minutes=duration,
            status="pending",
            created_at=utc_now(),
        )
        session.add(appointment)
        session.commit()
        return jsonify(
            booking={
                "id": appointment.id,
                "date": appointment.date.isoformat(),
                "service": appointment.service,
                "start_time": appointment.start_time.strftime("%H:%M"),
                "end_time": appointment.end_time.strftime("%H:%M"),
                "duration_minutes": appointment.duration_minutes,
                "status": appointment.status,
            },
            message="Your appointment request is booked. Please send the GHS 50 deposit to confirm it.",
        ), 201

    @app.get("/api/admin/bookings")
    @require_user("admin")
    def get_admin_bookings():
        session = db()
        today = datetime.now(timezone.utc).date()
        rows = session.execute(
            select(Appointment, User)
            .join(User, Appointment.client_user_id == User.id)
            .where(
                Appointment.status.in_(("pending", "confirmed")),
                Appointment.date >= today,
            )
            .order_by(Appointment.date, Appointment.start_time)
        ).all()
        return jsonify(
            bookings=[
                {
                    "id": appointment.id,
                    "client_name": client.full_name,
                    "email": client.email,
                    "phone": client.phone,
                    "service": appointment.service,
                    "date": appointment.date.isoformat(),
                    "start_time": appointment.start_time.strftime("%H:%M"),
                    "end_time": appointment.end_time.strftime("%H:%M"),
                    "duration_minutes": appointment.duration_minutes,
                    "status": appointment.status,
                }
                for appointment, client in rows
            ]
        )

    @app.patch("/api/admin/bookings/<int:booking_id>/payment")
    @require_user("admin")
    def confirm_booking_payment(booking_id: int):
        appointment = db().get(Appointment, booking_id)
        if appointment is None:
            return jsonify(error="That appointment could not be found."), 404

        payload = request.get_json(silent=True) or {}
        if payload.get("received") is not True:
            return jsonify(error="Confirm that the payment was received."), 400
        if appointment.status == "confirmed":
            return jsonify(message="Payment was already confirmed.", status="confirmed")
        if appointment.status != "pending":
            return jsonify(error="Payment cannot be confirmed for this appointment."), 409

        appointment.status = "confirmed"
        db().commit()
        return jsonify(message="Payment confirmed.", status=appointment.status)

    @app.cli.command("setup-admin")
    def setup_admin():
        """Create the one administrator; password input is hidden and stored hashed."""
        from getpass import getpass

        session = db()
        existing = session.scalar(select(User).where(User.role == "admin"))
        if existing:
            raise click.ClickException(f"An administrator account already exists: {existing.email}")
        email = click.prompt("Administrator email", default="admin@nailnurse.com").strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise click.ClickException("Enter a valid email address.")
        if session.scalar(select(User).where(User.email == email)):
            raise click.ClickException("That email is already registered. Choose another unique email.")
        full_name = click.prompt("Administrator full name", default="The Nail Nurse").strip()
        phone = click.prompt("Administrator phone", default="0539274008").strip()
        password = getpass("Administrator password (minimum 12 characters): ")
        confirmation = getpass("Confirm administrator password: ")
        if len(password) < 12:
            raise click.ClickException("Password must be at least 12 characters.")
        if password != confirmation:
            raise click.ClickException("Passwords do not match.")
        admin = User(
            full_name=full_name,
            email=email,
            phone=phone,
            password_hash=generate_password_hash(password),
            role="admin",
            accepted_terms=True,
            created_at=utc_now(),
        )
        session.add(admin)
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise click.ClickException("Could not create the administrator; check that the email is unique.") from error
        click.echo(f"Administrator created for {email}. The password was stored as a secure hash.")

    @app.cli.command("reset-admin-password")
    def reset_admin_password():
        """Set a new hidden password for an existing administrator account."""
        from getpass import getpass

        email = click.prompt("Administrator email", default="admin@nailnurse.com").strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise click.ClickException("Enter a valid email address.")
        admin = db().scalar(select(User).where(User.email == email, User.role == "admin"))
        if not admin:
            raise click.ClickException("No administrator exists with that email. Run setup-admin first.")
        password = getpass("New administrator password (minimum 12 characters): ")
        confirmation = getpass("Confirm new administrator password: ")
        if len(password) < 12:
            raise click.ClickException("Password must be at least 12 characters.")
        if password != confirmation:
            raise click.ClickException("Passwords do not match.")
        admin.password_hash = generate_password_hash(password)
        db().commit()
        click.echo(f"Administrator password updated for {email}. The password was stored as a secure hash.")

    return app


app = create_app()
