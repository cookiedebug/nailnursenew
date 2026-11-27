"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Availability, ClientBooking, logout, User } from "@/lib/api";

const services = [
  { name: "Acrylics", minutes: 110 },
  { name: "Builder gel", minutes: 90 },
  { name: "Gel X", minutes: 105 },
  { name: "Gel Stick ons", minutes: 90 },
  { name: "Manicure", minutes: 60 },
];

export default function BookingForm() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  const [month, setMonth] = useState("");
  const [calendarDates, setCalendarDates] = useState<Availability[]>([]);
  const [loadedCalendarMonth, setLoadedCalendarMonth] = useState("");
  const [myBookings, setMyBookings] = useState<ClientBooking[]>([]);
  const [myBookingsLoading, setMyBookingsLoading] = useState(true);
  const [myBookingsError, setMyBookingsError] = useState("");
  const [currentMinute, setCurrentMinute] = useState<number | null>(null);
  const [service, setService] = useState(services[0].name);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [availabilityFetchError, setAvailabilityFetchError] = useState(false);
  const [selectedTime, setSelectedTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then(({ user: current }) => {
        if (current.role === "admin") {
          router.replace("/admin");
          return;
        }
        setUser(current);
        const now = new Date();
        const formattedToday = localDate();
        setToday(formattedToday);
        setDate(formattedToday);
        setMonth(formattedToday.slice(0, 7));
        setCurrentMinute(now.getHours() * 60 + now.getMinutes());
      })
      .catch(() => {
        router.replace(`/signin?next=${encodeURIComponent("/book")}`);
      })
      .finally(() => setAuthLoading(false));
  }, [router]);

  useEffect(() => {
    if (!month) return;
    let active = true;
    api<{ dates: Availability[] }>(`/availability/calendar?month=${encodeURIComponent(month)}`)
      .then(({ dates }) => {
        if (active) {
          setCalendarDates(dates);
          setLoadedCalendarMonth(month);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Could not load the calendar.");
          setLoadedCalendarMonth(month);
        }
      });
    return () => { active = false; };
  }, [month]);

  useEffect(() => {
    if (!date) return;
    let active = true;
    api<{ availability: Availability }>(`/availability?date=${encodeURIComponent(date)}`)
      .then(({ availability: current }) => {
        if (active) {
          setAvailability(current);
          setAvailabilityDate(date);
          setAvailabilityFetchError(false);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Could not load availability.");
          setAvailabilityDate(date);
          setAvailabilityFetchError(true);
        }
      });
    return () => { active = false; };
  }, [date]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadBookings = async (showLoading = false) => {
      if (showLoading) setMyBookingsLoading(true);
      try {
        const result = await api<{ bookings: ClientBooking[] }>("/bookings");
        if (active) {
          setMyBookings(result.bookings);
          setMyBookingsError("");
        }
      } catch (reason) {
        if (active) setMyBookingsError(reason instanceof Error ? reason.message : "Could not load your bookings.");
      } finally {
        if (active && showLoading) setMyBookingsLoading(false);
      }
    };
    void loadBookings(true);
    const refresh = () => { void loadBookings(); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [user]);

  const selectedService = services.find((item) => item.name === service) ?? services[0];
  const availabilityLoading = Boolean(date && availabilityDate !== date);
  const currentAvailability = availabilityDate === date ? availability : null;
  const calendarLoading = Boolean(month && loadedCalendarMonth !== month);
  const calendarCells = useMemo(
    () => buildCalendar(month, today, loadedCalendarMonth === month ? calendarDates : []),
    [calendarDates, loadedCalendarMonth, month, today],
  );
  const times = useMemo(
    () => currentAvailability?.available ? availableTimes(currentAvailability, selectedService.minutes, currentMinute, today) : [],
    [currentAvailability, currentMinute, selectedService.minutes, today],
  );

  function changeMonth(amount: number) {
    const next = shiftMonth(month, amount);
    setMonth(next);
    setDate(`${next}-01`);
    setSelectedTime("");
    setAvailabilityDate("");
    setAvailabilityFetchError(false);
    setError("");
    setSuccess("");
  }

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await logout();
      router.replace("/");
    } catch (reason) {
      setSignOutError(
        reason instanceof Error && reason.name === "AbortError"
          ? "Sign out timed out. Please check your connection and try again."
          : reason instanceof Error ? reason.message : "Could not sign out. Please try again.",
      );
      setSigningOut(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<{ message: string; booking: ClientBooking }>("/bookings", {
        method: "POST",
        body: JSON.stringify({ date, service, start_time: selectedTime }),
      });
      setSuccess(result.message);
      setMyBookingsError("");
      setMyBookings((current) => [...current.filter((booking) => booking.id !== result.booking.id), result.booking]
        .sort((left, right) => left.date.localeCompare(right.date) || left.start_time.localeCompare(right.start_time)));
      setAvailability((current) => current ? {
        ...current,
        booked_slots: [...(current.booked_slots ?? []), {
          start_time: selectedTime,
          end_time: addMinutes(selectedTime, selectedService.minutes),
        }],
      } : current);
      setCalendarDates((current) => current.map((item) => item.date === date ? {
        ...item,
        booked_slots: [...(item.booked_slots ?? []), {
          start_time: selectedTime,
          end_time: addMinutes(selectedTime, selectedService.minutes),
        }],
      } : item));
      setSelectedTime("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your booking.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !user) {
    return <main className="loading-page"><span className="loading-heart" aria-hidden="true">♡</span><p>Getting your booking page ready...</p></main>;
  }

  return (
    <main className="booking-page">
      <header className="booking-header">
        <Link className="brand" href="/" aria-label="The Nail Nurse home">
          <Image src="/logo.png" alt="" width={64} height={64} />
        </Link>
        <div className="booking-user">
          <span>{user.full_name}</span>
          <button type="button" onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>
      {signOutError && <p className="form-error booking-signout-error" role="alert">{signOutError}</p>}

      <section className="booking-layout">
        <div className="booking-intro">
          <p className="eyebrow">Let’s make it a nail date</p>
          <h1>Book your<br /><em>little moment.</em></h1>
          <p>Hi {user.full_name.split(" ")[0]}, pick your service and a date. We’ll show you the times Cess is available.</p>
          <div className="deposit-card">
            <span aria-hidden="true">♡</span>
            <div><strong>GHS 50 deposit to secure your set</strong><p>Use your name as reference · MoMo 053 927 4008 · Francess Etornam</p></div>
          </div>
          <p className="booking-policy">Your appointment is confirmed after the deposit is received. Deposits are non-refundable and deducted from your bill.</p>
        </div>

        <form className="booking-card" onSubmit={submit}>
          <p className="eyebrow">Appointment details</p>
          <label>Choose a service
            <select value={service} onChange={(event) => { setService(event.target.value); setSelectedTime(""); setSuccess(""); }}>
              {services.map((item) => <option value={item.name} key={item.name}>{item.name} · about {formatDuration(item.minutes)}</option>)}
            </select>
          </label>
          <div className="calendar-picker">
            <div className="calendar-heading">
              <span>Choose an available date</span>
              <div>
                <button type="button" aria-label="Previous month" disabled={!month || month <= today.slice(0, 7)} onClick={() => changeMonth(-1)}>‹</button>
                <strong>{month ? formatMonth(month) : "Loading calendar..."}</strong>
                <button type="button" aria-label="Next month" disabled={!month} onClick={() => changeMonth(1)}>›</button>
              </div>
            </div>
            {calendarLoading ? <p className="calendar-loading"><span className="loading-dot" /> Updating available days...</p> : (
              <div className="calendar-grid" role="group" aria-label="Available appointment dates">
                {["M", "T", "W", "T", "F", "S", "S"].map((weekday, index) => <span className="calendar-weekday" key={`${weekday}-${index}`} aria-hidden="true">{weekday}</span>)}
                {calendarCells.map((cell, index) => cell ? (
                  <button
                    className={`calendar-day ${cell.date === date ? "selected" : ""} ${cell.available ? "open" : "closed"}`}
                    type="button"
                    key={cell.date}
                    disabled={!cell.available}
                    aria-label={`${prettyDate(cell.date)}${cell.available ? ", available" : ", unavailable"}`}
                    aria-pressed={cell.date === date}
                    onClick={() => { setDate(cell.date); setSelectedTime(""); setAvailabilityDate(""); setAvailabilityFetchError(false); setError(""); setSuccess(""); }}
                  >{cell.day}</button>
                ) : <span className="calendar-blank" key={`blank-${index}`} aria-hidden="true" />)}
              </div>
            )}
            <p className="calendar-legend"><span className="legend-open" /> Available <span className="legend-closed" /> Unavailable</p>
            <p className="selected-date">Selected: <strong>{date ? prettyDate(date) : "Choose a date"}</strong></p>
          </div>
          <p className="field-hint" id="date-hint">Service times are approximate and may vary depending on your design.</p>

          <div className="availability-panel" aria-live="polite">
            {availabilityLoading ? (
              <p><span className="loading-dot" /> Checking this date...</p>
            ) : availabilityFetchError ? (
              <p className="form-error" role="alert">Couldn’t load availability. Please try selecting the date again.</p>
            ) : currentAvailability?.available ? (
              <>
                <p className="availability-status is-available"><span /> Available on {prettyDate(date)}</p>
                {times.length ? (
                  <fieldset className="time-fieldset">
                    <legend>Choose a start time · {formatDuration(selectedService.minutes)}</legend>
                    <div className="time-grid">
                      {times.map((time) => (
                        <button
                          className={`time-option ${selectedTime === time ? "selected" : ""}`}
                          type="button"
                          aria-pressed={selectedTime === time}
                          onClick={() => { setSelectedTime(time); setSuccess(""); }}
                          key={time}
                        >{formatTime(time)}</button>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <p className="inline-note">There are no times left that fit this service on this date. Please try another day.</p>
                )}
              </>
            ) : date ? (
              <p className="availability-status is-unavailable"><span /> The nail technician is unavailable on this date. Please choose another day.</p>
            ) : (
              <p className="inline-note">Choose a date to check availability.</p>
            )}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}
          <button className="button button-primary form-submit" type="submit" disabled={busy || availabilityLoading || !currentAvailability?.available || !selectedTime}>
            {busy ? "Saving your appointment..." : "Request this appointment"}
          </button>
          <p className="secure-note">Signed in as {user.email}</p>
        </form>
      </section>
      <section className="dashboard-card client-bookings-card" aria-labelledby="client-bookings-heading">
        <div className="dashboard-card-heading">
          <div><p className="eyebrow">Your nail dates</p><h2 id="client-bookings-heading">My upcoming bookings</h2></div>
          <span className="appointment-total">{myBookings.length}</span>
        </div>
        {myBookingsError && <p className="form-error" role="alert">{myBookingsError}</p>}
        {myBookingsLoading ? (
          <p className="inline-note" role="status"><span className="loading-dot" /> Loading your bookings...</p>
        ) : myBookings.length === 0 ? (
          <div className="empty-bookings"><span aria-hidden="true">♡</span><p>Your selected appointments will appear here with their payment status.</p></div>
        ) : (
          <div className="appointment-list">
            {myBookings.map((booking) => (
              <article className="appointment-row client-appointment-row" key={booking.id}>
                <div className="appointment-date">
                  <strong>{new Date(`${booking.date}T12:00:00`).getDate()}</strong>
                  <span>{new Date(`${booking.date}T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</span>
                </div>
                <div className="appointment-client">
                  <h3>{booking.service}</h3>
                  <p>{prettyDate(booking.date)} · {formatTime(booking.start_time)}</p>
                  <p>{formatDuration(booking.duration_minutes)}</p>
                </div>
                <div className="appointment-time">
                  <span className={`booking-status ${booking.status === "confirmed" ? "is-confirmed" : booking.status === "cancelled" ? "is-cancelled" : "is-pending"}`} aria-live="polite">
                    {booking.status === "confirmed" ? "Payment confirmed" : booking.status === "pending" ? "Waiting for payment confirmation" : "Cancelled"}
                  </span>
                  {booking.status === "pending" && <span>GHS 50 deposit is awaiting confirmation.</span>}
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="booking-refresh-note">Payment status refreshes automatically while this page is open.</p>
      </section>
    </main>
  );
}

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function prettyDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours ? `${hours} hr${hours > 1 ? "s" : ""}` : ""}${hours && remaining ? " " : ""}${remaining ? `${remaining} min` : ""}`;
}

function formatTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function addMinutes(value: string, minutes: number): string {
  const [hour, minute] = value.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function availableTimes(
  availability: Availability,
  duration: number,
  currentMinute: number | null,
  today: string,
): string[] {
  const start = toMinutes(availability.start_time ?? "09:00");
  const end = toMinutes(availability.end_time ?? "18:00");
  const isToday = availability.date === today;
  const occupied = availability.booked_slots ?? [];
  const result: string[] = [];

  for (let cursor = start; cursor + duration <= end; cursor += 30) {
    if (isToday && currentMinute !== null && cursor <= currentMinute) continue;
    const overlaps = occupied.some((slot) => {
      const bookedStart = toMinutes(slot.start_time);
      const bookedEnd = toMinutes(slot.end_time);
      return cursor < bookedEnd && cursor + duration > bookedStart;
    });
    if (!overlaps) result.push(`${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`);
  }
  return result;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function buildCalendar(month: string, today: string, availableDates: Availability[]) {
  if (!month) return [];
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(year, monthNumber, 0).getDate();
  const firstDayOffset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const openDates = new Set(availableDates.filter((item) => item.available).map((item) => item.date));
  const cells: ({ date: string; day: number; available: boolean } | null)[] = Array(firstDayOffset).fill(null);
  for (let day = 1; day <= count; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, available: date >= today && openDates.has(date) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(year, monthNumber - 1 + amount, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}
