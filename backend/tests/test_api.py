import os
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from werkzeug.security import check_password_hash, generate_password_hash

from app import Availability, Base, User, create_app


class BookingApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        database_path = Path(self.temp_dir.name) / "test.sqlite3"
        self.app = create_app(
            {
                "TESTING": True,
                "DATABASE_URL": f"sqlite:///{database_path.as_posix()}",
                "FRONTEND_ORIGIN": "http://localhost:3000",
                "COOKIE_SECURE": False,
            }
        )
        self.client = self.app.test_client()
        self.admin_client = self.app.test_client()
        factory = self.app.extensions["db_session"]
        session = factory()
        admin = User(
            full_name="Nail Nurse",
            email="admin@nailnurse.com",
            phone="0539274008",
            password_hash=generate_password_hash("AdminPasswordStrong123!"),
            role="admin",
            accepted_terms=True,
            created_at=datetime.now(timezone.utc),
        )
        session.add(admin)
        session.commit()
        self.admin_id = admin.id
        factory.remove()
        headers = {"Origin": "http://localhost:3000"}
        response = self.admin_client.post(
            "/api/auth/login",
            json={"email": "admin@nailnurse.com", "password": "AdminPasswordStrong123!"},
            headers=headers,
        )
        self.assertEqual(response.status_code, 200)
        self.headers = headers
        self.book_date = (date.today() + timedelta(days=1)).isoformat()

    def tearDown(self):
        factory = self.app.extensions["db_session"]
        factory.remove()
        Base.metadata.drop_all(factory.bind)
        factory.bind.dispose()
        self.temp_dir.cleanup()

    def create_client_account(self):
        return self.client.post(
            "/api/auth/register",
            json={
                "full_name": "Ama Client",
                "email": "ama@example.com",
                "phone": "0241234567",
                "password": "ClientPasswordStrong123!",
                "accepted_terms": True,
            },
            headers=self.headers,
        )

    def set_availability(self, available=True, confirm=False):
        return self.admin_client.put(
            f"/api/admin/availability/{self.book_date}",
            json={
                "available": available,
                "start_time": None,
                "end_time": None,
                "confirm_existing": confirm,
            },
            headers=self.headers,
        )

    def test_admin_routes_are_role_protected_and_dates_are_validated(self):
        unauthenticated = self.client.get(f"/api/admin/availability/{self.book_date}")
        self.assertEqual(unauthenticated.status_code, 401)

        self.assertEqual(self.create_client_account().status_code, 201)
        forbidden = self.client.put(
            f"/api/admin/availability/{self.book_date}",
            json={"available": True},
            headers=self.headers,
        )
        self.assertEqual(forbidden.status_code, 403)

        invalid_date = self.admin_client.put(
            "/api/admin/availability/2026-02-31",
            json={"available": True},
            headers=self.headers,
        )
        self.assertEqual(invalid_date.status_code, 400)

    def test_clients_cannot_book_unavailable_dates_and_slots_are_rechecked(self):
        self.assertEqual(self.create_client_account().status_code, 201)
        unavailable = self.client.post(
            "/api/bookings",
            json={"date": self.book_date, "service": "Manicure", "start_time": "09:00"},
            headers=self.headers,
        )
        self.assertEqual(unavailable.status_code, 409)
        self.assertTrue(unavailable.json["unavailable"])

        self.assertEqual(self.set_availability(True).status_code, 200)
        booked = self.client.post(
            "/api/bookings",
            json={"date": self.book_date, "service": "Manicure", "start_time": "09:00"},
            headers=self.headers,
        )
        self.assertEqual(booked.status_code, 201)
        self.assertEqual(booked.json["booking"]["duration_minutes"], 60)

        public = self.client.get(
            f"/api/availability?date={self.book_date}",
            headers=self.headers,
        )
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.json["availability"]["booked_slots"], [
            {"start_time": "09:00", "end_time": "10:00"}
        ])

        another_client = self.app.test_client()
        self.assertEqual(
            another_client.post(
                "/api/auth/register",
                json={
                    "full_name": "Kojo Client",
                    "email": "kojo@example.com",
                    "phone": "0241234568",
                    "password": "AnotherClientPassword123!",
                    "accepted_terms": True,
                },
                headers=self.headers,
            ).status_code,
            201,
        )
        conflict = another_client.post(
            "/api/bookings",
            json={"date": self.book_date, "service": "Manicure", "start_time": "09:30"},
            headers=self.headers,
        )
        self.assertEqual(conflict.status_code, 409)

    def test_owner_confirms_unavailability_without_deleting_existing_bookings(self):
        self.assertEqual(self.create_client_account().status_code, 201)
        self.assertEqual(self.set_availability(True).status_code, 200)
        self.assertEqual(
            self.client.post(
                "/api/bookings",
                json={"date": self.book_date, "service": "Manicure", "start_time": "09:00"},
                headers=self.headers,
            ).status_code,
            201,
        )
        warning = self.set_availability(False)
        self.assertEqual(warning.status_code, 409)
        self.assertTrue(warning.json["requires_confirmation"])
        self.assertEqual(warning.json["appointment_count"], 1)

        closed = self.set_availability(False, confirm=True)
        self.assertEqual(closed.status_code, 200)
        self.assertFalse(closed.json["availability"]["available"])
        self.assertEqual(closed.json["appointment_count"], 1)
        bookings = self.admin_client.get("/api/admin/bookings")
        self.assertEqual(len(bookings.json["bookings"]), 1)

    def test_client_can_track_own_booking_and_admin_can_confirm_payment(self):
        self.assertEqual(self.client.get("/api/bookings").status_code, 401)
        self.assertEqual(self.create_client_account().status_code, 201)
        self.assertEqual(self.set_availability(True).status_code, 200)
        created = self.client.post(
            "/api/bookings",
            json={"date": self.book_date, "service": "Manicure", "start_time": "09:00"},
            headers=self.headers,
        )
        self.assertEqual(created.status_code, 201)
        booking_id = created.json["booking"]["id"]
        self.assertEqual(created.json["booking"]["status"], "pending")

        client_bookings = self.client.get("/api/bookings", headers=self.headers)
        self.assertEqual(len(client_bookings.json["bookings"]), 1)
        self.assertEqual(client_bookings.json["bookings"][0]["status"], "pending")

        another_client = self.app.test_client()
        self.assertEqual(
            another_client.post(
                "/api/auth/register",
                json={
                    "full_name": "Kojo Client",
                    "email": "kojo@example.com",
                    "phone": "0241234568",
                    "password": "AnotherClientPassword123!",
                    "accepted_terms": True,
                },
                headers=self.headers,
            ).status_code,
            201,
        )
        self.assertEqual(another_client.get("/api/bookings").json["bookings"], [])
        anonymous = self.app.test_client()
        payment_url = f"/api/admin/bookings/{booking_id}/payment"
        self.assertEqual(
            anonymous.patch(payment_url, json={"received": True}, headers=self.headers).status_code,
            401,
        )
        self.assertEqual(
            self.client.patch(
                payment_url,
                json={"received": True},
                headers=self.headers,
            ).status_code,
            403,
        )
        self.assertEqual(
            self.admin_client.patch(
                payment_url,
                json={"received": False},
                headers=self.headers,
            ).status_code,
            400,
        )
        self.assertEqual(
            self.admin_client.patch(
                payment_url,
                json={"received": True},
                headers=self.headers,
            ).json["status"],
            "confirmed",
        )
        self.assertEqual(
            self.client.get("/api/bookings", headers=self.headers).json["bookings"][0]["status"],
            "confirmed",
        )
        repeated = self.admin_client.patch(
            payment_url,
            json={"received": True},
            headers=self.headers,
        )
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json["status"], "confirmed")
        self.assertEqual(
            self.admin_client.patch(
                "/api/admin/bookings/999999/payment",
                json={"received": True},
                headers=self.headers,
            ).status_code,
            404,
        )

    def test_registration_password_is_hashed(self):
        response = self.create_client_account()
        self.assertEqual(response.status_code, 201)
        session = self.app.extensions["db_session"]()
        user = session.query(User).filter_by(email="ama@example.com").one()
        self.assertNotEqual(user.password_hash, "ClientPasswordStrong123!")
        self.assertTrue(check_password_hash(user.password_hash, "ClientPasswordStrong123!"))

    def test_logout_invalidates_session_and_is_idempotent(self):
        self.assertEqual(self.create_client_account().status_code, 201)
        signed_out = self.client.post("/api/auth/logout", json={}, headers=self.headers)
        self.assertEqual(signed_out.status_code, 200)
        self.assertEqual(signed_out.json["message"], "You have been signed out.")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

        repeated = self.client.post("/api/auth/logout", json={}, headers=self.headers)
        self.assertEqual(repeated.status_code, 200)

    def test_localhost_alias_is_allowed_for_browser_logout(self):
        response = self.client.post(
            "/api/auth/logout",
            json={},
            headers={"Origin": "http://127.0.0.1:3000"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["Access-Control-Allow-Origin"],
            "http://127.0.0.1:3000",
        )

    def test_same_origin_requests_work_on_vercel_preview_domains(self):
        origin = "https://nailnurse-preview.vercel.app"
        response = self.client.post(
            "/api/auth/register",
            json={
                "full_name": "Ama Client",
                "email": "ama@example.com",
                "phone": "0241234567",
                "password": "ClientPasswordStrong123!",
                "accepted_terms": True,
            },
            headers={"Origin": origin},
            base_url=origin,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], origin)

    def test_admin_setup_prompts_for_and_hashes_the_default_admin_password(self):
        setup_dir = tempfile.TemporaryDirectory()
        database_path = Path(setup_dir.name) / "setup.sqlite3"
        setup_app = create_app(
            {
                "TESTING": True,
                "DATABASE_URL": f"sqlite:///{database_path.as_posix()}",
                "FRONTEND_ORIGIN": "http://localhost:3000",
            }
        )
        with patch(
            "getpass.getpass",
            side_effect=["PrivateAdminPassphrase123!", "PrivateAdminPassphrase123!"],
        ):
            result = setup_app.test_cli_runner().invoke(
                args=["setup-admin"],
                input="\n\n\n",
            )
        self.assertEqual(result.exit_code, 0, result.output)
        factory = setup_app.extensions["db_session"]
        admin = factory.query(User).filter_by(email="admin@nailnurse.com").one()
        self.assertEqual(admin.role, "admin")
        self.assertNotEqual(admin.password_hash, "PrivateAdminPassphrase123!")
        self.assertTrue(check_password_hash(admin.password_hash, "PrivateAdminPassphrase123!"))
        factory.remove()
        Base.metadata.drop_all(factory.bind)
        factory.bind.dispose()
        setup_dir.cleanup()

    def test_admin_password_reset_is_hidden_and_stored_as_a_hash(self):
        with patch(
            "getpass.getpass",
            side_effect=["NewPrivateAdminPassphrase456!", "NewPrivateAdminPassphrase456!"],
        ):
            result = self.app.test_cli_runner().invoke(
                args=["reset-admin-password"],
                input="admin@nailnurse.com\n",
            )
        self.assertEqual(result.exit_code, 0, result.output)
        admin = self.app.extensions["db_session"].query(User).filter_by(
            email="admin@nailnurse.com"
        ).one()
        self.assertNotEqual(admin.password_hash, "NewPrivateAdminPassphrase456!")
        self.assertTrue(check_password_hash(admin.password_hash, "NewPrivateAdminPassphrase456!"))
        self.assertFalse(check_password_hash(admin.password_hash, "AdminPasswordStrong123!"))

    def test_calendar_only_lists_enabled_dates_and_date_record_is_unique(self):
        self.assertEqual(self.set_availability(True).status_code, 200)
        self.assertEqual(self.set_availability(True).status_code, 200)
        month = self.book_date[:7]
        calendar = self.client.get(f"/api/availability/calendar?month={month}")
        self.assertEqual(calendar.status_code, 200)
        self.assertEqual([item["date"] for item in calendar.json["dates"]], [self.book_date])

        invalid_month = self.client.get("/api/availability/calendar?month=0000-00")
        self.assertEqual(invalid_month.status_code, 400)
        factory = self.app.extensions["db_session"]
        self.assertEqual(factory.query(Availability).filter_by(date=date.fromisoformat(self.book_date)).count(), 1)


class VercelConfigurationTests(unittest.TestCase):
    def test_vercel_requires_postgresql_and_a_persistent_secret(self):
        with patch.dict(os.environ, {"VERCEL": "1"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "hosted PostgreSQL"):
                create_app()

            with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///local.sqlite3"}):
                with self.assertRaisesRegex(RuntimeError, "hosted PostgreSQL"):
                    create_app()

            with patch.dict(os.environ, {"DATABASE_URL": "postgresql://db.example/nailnurse"}):
                with self.assertRaisesRegex(RuntimeError, "SECRET_KEY"):
                    create_app()

    def test_vercel_uses_psycopg_and_secure_cookies_without_creating_schema(self):
        with patch.dict(
            os.environ,
            {
                "VERCEL": "1",
                "DATABASE_URL": "postgresql://db.example/nailnurse",
                "SECRET_KEY": "test-secret",
            },
            clear=True,
        ):
            app = create_app()
        self.assertEqual(app.config["DATABASE_URL"], "postgresql+psycopg://db.example/nailnurse")
        self.assertTrue(app.config["COOKIE_SECURE"])
        self.assertFalse(app.config["AUTO_CREATE_SCHEMA"])
        factory = app.extensions["db_session"]
        factory.remove()
        factory.bind.dispose()


if __name__ == "__main__":
    unittest.main()
