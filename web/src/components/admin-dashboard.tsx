"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, Availability, Booking, logout, User } from "@/lib/api";

interface AvailabilityResult {
  availability: Availability;
  appointment_count: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  const [day, setDay] = useState<AvailabilityResult | null>(null);
  const [loadedDate, setLoadedDate] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [paymentUpdatingId, setPaymentUpdatingId] = useState<number | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then(({ user: current }) => {
        if (current.role !== "admin") return;
        const currentDate = localDate();
        setUser(current);
        setAuthorized(true);
        setDate(currentDate);
        setToday(currentDate);
      })
      .catch(() => {
        router.replace(`/signin?next=${encodeURIComponent("/admin")}`);
      })
      .finally(() => setAuthLoading(false));
  }, [router]);

  useEffect(() => {
    if (!authorized || !date) return;
    let active = true;
    api<AvailabilityResult>(`/admin/availability/${encodeURIComponent(date)}`)
      .then((result) => {
        if (!active) return;
        setDay(result);
        setStartTime(result.availability.start_time ?? "");
        setEndTime(result.availability.end_time ?? "");
        setLoadedDate(date);
      })
      .catch((reason: unknown) => {
        if (active) {
          setDay(null);
          setError(reason instanceof Error ? reason.message : "Could not load this date.");
          setLoadedDate(date);
        }
      });
    return () => { active = false; };
  }, [authorized, date]);

  useEffect(() => {
    if (!authorized) return;
    let active = true;
    const loadBookings = () => {
      void api<{ bookings: Booking[] }>("/admin/bookings")
        .then((result) => { if (active) setBookings(result.bookings); })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : "Could not load appointments.");
        });
    };
    loadBookings();
    const interval = window.setInterval(loadBookings, 30_000);
    window.addEventListener("focus", loadBookings);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", loadBookings);
    };
  }, [authorized]);

  const loading = authorized && date !== loadedDate;

  async function changeAvailability(available: boolean, confirmed = false) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api<AvailabilityResult & { message: string }>(
        `/admin/availability/${encodeURIComponent(date)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            available,
            start_time: startTime || null,
            end_time: endTime || null,
            confirm_existing: confirmed,
          }),
        },
      );
      setDay(result);
      setMessage(available ? `You're marked available for ${prettyDate(date)}.` : `You're marked unavailable for ${prettyDate(date)}.`);
    } catch (reason) {
      if (reason instanceof ApiError && reason.requiresConfirmation) {
        const count = day?.appointment_count ?? 0;
        const confirmedByOwner = window.confirm(
          `${count} appointment${count === 1 ? "" : "s"} already exist on ${prettyDate(date)}. Marking this date unavailable will not cancel them. Continue?`,
        );
        if (confirmedByOwner) {
          await changeAvailability(available, true);
          return;
        }
      }
      setError(reason instanceof Error ? reason.message : "Could not update availability.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    try {
      await logout();
      router.replace("/");
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === "AbortError"
          ? "Sign out timed out. Please check your connection and try again."
          : reason instanceof Error ? reason.message : "Could not sign out.",
      );
    }
  }

  async function confirmPayment(booking: Booking) {
    setPaymentUpdatingId(booking.id);
    setPaymentMessage("");
    setPaymentError("");
    try {
      const result = await api<{ message: string; status: Booking["status"] }>(
        `/admin/bookings/${booking.id}/payment`,
        {
          method: "PATCH",
          body: JSON.stringify({ received: true }),
        },
      );
      setBookings((current) => current.map((item) =>
        item.id === booking.id ? { ...item, status: result.status } : item,
      ));
      setPaymentMessage(`${booking.client_name}’s payment is confirmed.`);
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : "Could not confirm this payment.");
    } finally {
      setPaymentUpdatingId(null);
    }
  }

  if (authLoading) return <main className="loading-page"><span className="loading-heart" aria-hidden="true">♡</span><p>Opening your dashboard...</p></main>;

  if (!authorized) {
    return (
      <main className="access-denied">
        <Image src="/logo.png" alt="" width={80} height={80} />
        <p className="eyebrow">Owner access only</p>
        <h1>This space is just for Cess.</h1>
        <p>Please sign in with the administrator account to manage availability and view bookings.</p>
        <Link className="button button-primary" href="/signin?next=/admin">Sign in as owner</Link>
        <Link className="text-link" href="/">Back to the website</Link>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="footer-brand" href="/"><Image src="/logo.png" alt="" width={54} height={54} />The Nail Nurse</Link>
        <div className="dashboard-user"><span>{user?.full_name}</span><button type="button" onClick={signOut}>Sign out</button></div>
      </header>

      <div className="dashboard-wrap">
        <div className="dashboard-welcome">
          <p className="eyebrow">The owner’s corner</p>
          <h1>Good day, Cess <span aria-hidden="true">♡</span></h1>
          <p>Keep an eye on your appointments and let clients know when you’re taking bookings.</p>
        </div>

        <section className="dashboard-card availability-card" aria-labelledby="availability-heading">
          <div className="dashboard-card-heading">
            <div><p className="eyebrow">Your calendar</p><h2 id="availability-heading">Set your availability</h2></div>
            <span className="today-label">{today ? `Today · ${prettyDate(today)}` : "Today"}</span>
          </div>
          <label className="date-picker-label">Choose a date
            <input type="date" min={today} value={date} onChange={(event) => { setDate(event.target.value); setMessage(""); setError(""); setDay(null); setLoadedDate(""); }} />
          </label>

          {loading ? <p className="inline-note"><span className="loading-dot" /> Loading date...</p> : day && (
            <>
              <div className={`owner-status ${day.availability.available ? "is-available" : "is-unavailable"}`} aria-live="polite">
                <span className="status-dot" />
                <div><strong>{day.availability.available ? "You’re available" : "You’re unavailable"}</strong><p>{day.availability.available ? `Clients can book ${prettyDate(date)}.` : "Clients cannot book this date right now."}</p></div>
                <span className="status-count">{day.appointment_count} appointment{day.appointment_count === 1 ? "" : "s"}</span>
              </div>

              <div className="hours-row">
                <p>Optional booking hours</p>
                <label>From<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} aria-label="Availability start time" /></label>
                <label>Until<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} aria-label="Availability end time" /></label>
                <small>Leave both blank for 9:00 AM–6:00 PM.</small>
              </div>

              <div className="availability-actions">
                <button className={`availability-button available-button ${day.availability.available ? "current" : ""}`} type="button" onClick={() => void changeAvailability(true)} disabled={saving || loading} aria-pressed={day.availability.available}>
                  <span aria-hidden="true">♡</span> I’m Available
                </button>
                <button className={`availability-button unavailable-button ${!day.availability.available ? "current" : ""}`} type="button" onClick={() => void changeAvailability(false)} disabled={saving || loading} aria-pressed={!day.availability.available}>
                  <span aria-hidden="true">—</span> I’m Unavailable
                </button>
              </div>
            </>
          )}
          {saving && <p className="inline-note" role="status"><span className="loading-dot" /> Saving your availability...</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>

        <section className="dashboard-card appointments-card">
          <div className="dashboard-card-heading"><div><p className="eyebrow">Get set for their visit</p><h2>Upcoming appointments</h2></div><span className="appointment-total">{bookings.length}</span></div>
          {paymentMessage && <p className="form-success" role="status">{paymentMessage}</p>}
          {paymentError && <p className="form-error" role="alert">{paymentError}</p>}
          {bookings.length === 0 ? (
            <div className="empty-bookings"><span aria-hidden="true">♡</span><p>No upcoming bookings yet. They’ll show up here as soon as a client books.</p></div>
          ) : (
            <div className="appointment-list">
              {bookings.map((booking) => (
                <article className="appointment-row" key={booking.id}>
                  <div className="appointment-date"><strong>{new Date(`${booking.date}T12:00:00`).getDate()}</strong><span>{new Date(`${booking.date}T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</span></div>
                  <div className="appointment-client"><h3>{booking.client_name}</h3><p>{booking.service} · {formatDuration(booking.duration_minutes)}</p><a href={`mailto:${booking.email}`}>{booking.email}</a><a href={`tel:${booking.phone}`}>{booking.phone}</a></div>
                  <div className="appointment-time">
                    <strong>{formatTime(booking.start_time)}</strong>
                    <span className={`booking-status ${booking.status === "confirmed" ? "is-confirmed" : "is-pending"}`}>
                      {booking.status === "confirmed" ? "Payment confirmed" : "Awaiting payment"}
                    </span>
                    {booking.status === "pending" && (
                      <button
                        className="payment-confirm-button"
                        type="button"
                        onClick={() => void confirmPayment(booking)}
                        disabled={paymentUpdatingId !== null}
                      >
                        {paymentUpdatingId === booking.id ? "Saving..." : "Confirm payment received"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function prettyDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours ? `${hours} hr${hours > 1 ? "s" : ""}` : ""}${hours && rest ? " " : ""}${rest ? `${rest} min` : ""}`;
}
