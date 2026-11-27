import Image from "next/image";
import Link from "next/link";
import NailGallery from "@/components/nail-gallery";

const services = [
  {
    name: "Acrylic",
    duration: "1 hr 50 min",
    description: "Sculpted length, shape and a look made all your own.",
    prices: [["Short length", "GHS 130"], ["Medium short", "GHS 150"], ["Medium", "GHS 180"], ["Long", "GHS 210"]],
  },
  {
    name: "Builder gel",
    duration: "1 hr 30 min",
    description: "A beautiful, supportive finish for your natural nails.",
    prices: [["Overlay", "GHS 120–150"], ["Short", "GHS 150"], ["Medium", "GHS 170"], ["Long", "GHS 190"]],
  },
  {
    name: "Gel X",
    duration: "1 hr 45 min",
    description: "Lightweight extensions with a clean, seamless finish.",
    prices: [["Full set", "GHS 140"]],
  },
  {
    name: "Gel Stick ons",
    duration: "1 hr 30 min",
    description: "A polished, pretty set with a little extra length.",
    prices: [["Solid color · Short", "GHS 85"], ["Solid color · Medium short", "GHS 95"], ["Solid color · Medium", "GHS 110"], ["Solid color · Long", "GHS 125"]],
  },
  {
    name: "Manicure",
    duration: "1 hour",
    description: "Thoughtful nail care, shaping and a fresh finish.",
    prices: [["Pricing", "Price on request"]],
  },
  {
    name: "Toe nails",
    description: "A fresh finish for your toes, from a simple polish to extensions.",
    prices: [["Trim & polish", "~GHS 50"], ["Solid color + extensions", "GHS 70"], ["Extension + French", "GHS 75"]],
  },
  {
    name: "Nail art",
    description: "Add a little extra detail to your set.",
    prices: [
      ["Ombré / airbrush", "GHS 30"],
      ["French set", "GHS 30"],
      ["3D gel flower", "GHS 8 / finger"],
      ["3D swirls", "GHS 8 / finger"],
      ["Chrome", "GHS 7 / finger"],
      ["Cat-eye set", "GHS 35"],
      ["Rhinestones / charms", "Priced by design"],
    ],
  },
];

const policies = [
  ["Appointment policy", "Appointments must be booked in advance. Walk-ins are subject to availability."],
  ["Deposit policy", "A non-refundable GHS 50 deposit secures your appointment and is deducted from the total bill. Your booking is confirmed after the deposit is received."],
  ["Late policy", "Arriving more than 10–15 minutes late may mean your appointment is rescheduled or shortened, depending on availability."],
  ["Cancellation policy", "Please cancel or reschedule at least 24 hours before your appointment. Late cancellations may result in loss of deposit."],
  ["No-show policy", "Clients who do not show up without notice forfeit their deposit and may be asked to pay upfront for future bookings."],
  ["No extra guests", "To keep the studio calm and professional, please do not bring extra guests or children unless we have discussed it beforehand."],
  ["Nail fix / repair", "Repairs are free only within 24–48 hours of your appointment. After that, fixes will be charged."],
];

export default function Home() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="The Nail Nurse home">
          <Image src="/logo.png" alt="The Nail Nurse logo" width={76} height={76} priority />
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#about">My story</a>
          <a href="#services">Services</a>
          <a href="#gallery">Gallery</a>
          <a href="#policies">Policies</a>
          <a href="#contact">Find me</a>
        </nav>
        <Link className="button button-small button-outline" href="/signin?next=/book">Client sign in <span aria-hidden="true">↗</span></Link>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-copy">
            <p className="eyebrow">The Nail Nurse · Ho, Ghana</p>
            <h1>Healthy nails,<br /><em>happy you.</em></h1>
            <p className="lead">A little self-care, a lot of confidence. Find your next favourite set in a relaxed, welcoming studio.</p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/signin?next=/book">Book an appointment <span aria-hidden="true">↗</span></Link>
              <a className="text-link" href="#services">Explore services <span aria-hidden="true">↓</span></a>
            </div>
            <p className="hero-note">By appointment · Ho, Firebrand Church area</p>
          </div>
          <div className="hero-art">
            <span className="orbit orbit-one" aria-hidden="true" />
            <span className="orbit orbit-two" aria-hidden="true" />
            <div className="hero-logo"><Image src="/logo.png" alt="" width={460} height={460} priority /></div>
            <span className="art-note">Your nails, lovingly cared for <span aria-hidden="true">♡</span></span>
          </div>
          <a className="scroll-cue" href="#about">Scroll to explore <span aria-hidden="true">↓</span></a>
        </section>

        <section className="about-section section-wrap" id="about">
          <div className="section-kicker"><span>01</span> A note from Cess</div>
          <div className="about-copy">
            <p className="eyebrow">The Nail Nurse says...</p>
            <h2>Healthy nails,<br /><em>happy you!</em></h2>
            <p>Beautiful nails start with care. Come as you are and leave feeling a little more like yourself. I look forward to giving you a lovely, personal nail experience.</p>
            <p className="signature">With love, Cess <span aria-hidden="true">♡</span></p>
          </div>
          <aside className="about-card">
            <Image src="/logo.png" alt="The Nail Nurse logo" width={108} height={108} />
            <p className="eyebrow">Your Ho nail studio</p>
            <p>Thoughtful nail care<br />and pretty little details.</p>
            <a href="#contact">Come say hello <span aria-hidden="true">↗</span></a>
          </aside>
        </section>

        <section className="services-section section-wrap" id="services">
          <div className="section-heading">
            <div>
              <p className="eyebrow">A little something for you</p>
              <h2>Pick your <em>pretty.</em></h2>
            </div>
            <p>Prices are in Ghana cedis (GHS). Service times are approximate and may vary depending on the design and prep needed.</p>
          </div>
          <div className="service-grid">
            {services.map((service, index) => (
              <article className="service-card" key={service.name}>
                <span className="service-index">0{index + 1}</span>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
                <ul className="service-prices">
                  {service.prices.map(([label, price]) => (
                    <li key={label}><span>{label}</span><strong>{price}</strong></li>
                  ))}
                </ul>
                {service.duration && <div className="service-meta"><span>Approx. time</span><strong>{service.duration}</strong></div>}
                <Link href="/signin?next=/book">Book this service <span aria-hidden="true">↗</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className="gallery-section section-wrap" id="gallery">
          <div className="gallery-intro">
            <p className="eyebrow">A little inspiration</p>
            <h2>Made with love,<br /><em>worn with joy.</em></h2>
            <p>Take a peek at Cess’s latest sets and favourite nail details over on Instagram.</p>
            <a className="text-link" href="https://www.instagram.com/nailedbycessss/" target="_blank" rel="noreferrer">Follow @nailedbycessss <span aria-hidden="true">↗</span></a>
          </div>
          <NailGallery />
        </section>

        <section className="booking-banner">
          <p className="eyebrow">Your next set is calling</p>
          <h2>Ready for a little<br /><em>nail date?</em></h2>
          <p>Create an account, choose your service, and find a date that works for you.</p>
          <Link className="button button-light" href="/signin?next=/book">Let’s get you booked <span aria-hidden="true">↗</span></Link>
        </section>

        <section className="policy-section section-wrap" id="policies">
          <div className="policy-heading">
            <p className="eyebrow">A few things to know</p>
            <h2>Before you<br /><em>book, lovely.</em></h2>
            <p>Thank you for respecting my time and policies. I look forward to providing you with the best experience!</p>
          </div>
          <div className="policy-list">
            {policies.map(([title, detail], index) => (
              <details className="policy-item" key={title}>
                <summary><span className="policy-number">0{index + 1}</span><strong>{title}</strong><span className="policy-plus" aria-hidden="true">+</span></summary>
                <p>{detail}</p>
              </details>
            ))}
            <div className="deposit-note">
              <span className="deposit-heart" aria-hidden="true">♡</span>
              <div>
                <strong>No deposit, no appointment ✨</strong>
                <p>GHS 50 deposit · Use your name as the payment reference.<br />Mobile Money: <a href="tel:0539274008">0539274008</a> · Francess Etornam</p>
              </div>
            </div>
          </div>
        </section>

        <section className="contact-section section-wrap" id="contact">
          <div>
            <p className="eyebrow">Come find me</p>
            <h2>Your little<br /><em>Ho hideaway.</em></h2>
          </div>
          <div className="contact-cards">
            <a className="contact-card" href="https://maps.google.com/?q=Firebrand+Church+Ho+Ghana" target="_blank" rel="noreferrer">
              <span className="contact-icon" aria-hidden="true">⌖</span>
              <span><small>Find the studio</small><strong>Ho, Firebrand Church area</strong></span>
              <span aria-hidden="true">↗</span>
            </a>
            <a className="contact-card" href="https://www.instagram.com/nailedbycessss/" target="_blank" rel="noreferrer">
              <span className="contact-icon" aria-hidden="true">＠</span>
              <span><small>Instagram</small><strong>@nailedbycessss</strong></span>
              <span aria-hidden="true">↗</span>
            </a>
            <a className="contact-card" href="https://www.tiktok.com/@nailedbycessss?_r=1&_t=ZS-9BkzeetQC3A" target="_blank" rel="noreferrer">
              <span className="contact-icon" aria-hidden="true">♪</span>
              <span><small>TikTok</small><strong>The Nail Nurse</strong></span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <Link className="footer-brand" href="/"><Image src="/logo.png" alt="" width={52} height={52} />The Nail Nurse</Link>
        <span>Healthy nails, happy you! <span aria-hidden="true">♡</span></span>
        <div><Link href="/admin">Owner dashboard</Link></div>
      </footer>
    </>
  );
}
