import React, { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import "@fortawesome/fontawesome-free/css/all.min.css";
import pages from "./site/pages.json";
import services from "./site/services.json";
import { api } from "./api";
import "./site/theme.css";
import "./site/compatibility.css";

const links = [
  ["/", "Home"],
  ["/about/", "About Us"],
  ["/services/", "Services"],
  ["/projects/", "Projects"],
  ["/team/", "Our Team"],
];
function QuoteForm({ service, onDone }) {
  const [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input = Object.fromEntries(new FormData(event.currentTarget));
    input.service ||= "other";
    try {
      await api("/enquiries", { method: "POST", body: input });
      setSuccess(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    name,
    label,
    type = "text",
    required = false,
    placeholder = "",
  ) => (
    <div className="m-form-group">
      <label htmlFor={`m-${name}`}>{label}</label>
      <input
        id={`m-${name}`}
        name={name}
        className="m-form-control"
        type={type}
        required={required}
        placeholder={placeholder}
        aria-invalid={!!error?.fields?.[name]}
        aria-describedby={error?.fields?.[name] ? `m-${name}-error` : undefined}
        autoComplete={
          {
            first_name: "given-name",
            last_name: "family-name",
            email: "email",
            phone: "tel",
            address: "street-address",
          }[name]
        }
      />
      {error?.fields?.[name] && (
        <p className="site-field-error" id={`m-${name}-error`}>
          {error.fields[name]}
        </p>
      )}
    </div>
  );
  if (success)
    return (
      <div className="quote-success" role="status">
        <i className="fa-solid fa-circle-check" aria-hidden="true" />
        <h3>Thank you. Your enquiry is saved.</h3>
        <p>Our estimation team will review your project details.</p>
        <button className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    );
  return (
    <form id="quoteForm" onSubmit={submit} aria-busy={busy}>
      <div className="m-form-row">
        {field("first_name", "First Name", "text", true, "John")}
        {field("last_name", "Last Name", "text", true, "Doe")}
      </div>
      {field("email", "Email Address", "email", true, "john@company.com")}
      <div className="m-form-group">
        <label htmlFor="m-service">Service Needed (Optional)</label>
        <select
          id="m-service"
          name="service"
          className="m-form-control"
          defaultValue={service || ""}
        >
          <option value="">Select a Service</option>
          <option value="commercial">Commercial Concrete</option>
          <option value="residential">Residential Concrete</option>
          <option value="repair">Structural Repair</option>
          {services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.title}
            </option>
          ))}
          <option value="other">Other / General Inquiry</option>
        </select>
      </div>
      {field("phone", "Phone (Optional)", "tel")}
      {field("address", "Site Address (Optional)")}
      <div className="m-form-group">
        <label htmlFor="m-message">Project Details</label>
        <textarea
          id="m-message"
          name="message"
          className="m-form-control"
          placeholder="Please describe your project, estimated square footage, and timeline..."
          required
          minLength={10}
          maxLength={10000}
          aria-invalid={!!error?.fields?.message}
          aria-describedby={
            error?.fields?.message ? "m-message-error" : undefined
          }
        />
        {error?.fields?.message && (
          <p id="m-message-error" className="site-field-error">
            {error.fields.message}
          </p>
        )}
      </div>
      <div className="site-honeypot" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {error && (
        <div className="site-form-error" role="alert">
          {error.message}
        </div>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: "100%" }}
        disabled={busy}
      >
        {busy ? "Submitting..." : "Submit Request"}{" "}
        <i
          className="fa-solid fa-paper-plane"
          style={{ marginLeft: 8 }}
          aria-hidden="true"
        />
      </button>
    </form>
  );
}
export function PublicSite() {
  const { pathname } = useLocation(),
    path = pathname.replace(/\/$/, "") || "/";
  const root = useRef(null),
    quoteFocus = useRef(null),
    menuFocus = useRef(null),
    openingQuote = useRef(false),
    content = useRef(null);
  const [quoteOpen, setQuoteOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [service, setService] = useState(""),
    [contactOpen, setContactOpen] = useState(false);
  const pageClass = path.startsWith("/portfolio/")
    ? "project"
    : path.startsWith("/service/")
      ? "service"
      : path.slice(1) || "home";
  const html = useMemo(
    () => ({
      __html:
        pages[path] ||
        '<main id="main" class="container" style="padding:160px 20px"><h1>Page not found</h1><a href="/">Return home</a></main>',
    }),
    [path],
  );
  const openQuote = (selected = "", trigger = document.activeElement) => {
    quoteFocus.current = trigger;
    openingQuote.current = true;
    setMenuOpen(false);
    setContactOpen(false);
    setService(selected);
    setQuoteOpen(true);
  };
  useEffect(() => {
    const node = content.current;
    if (!node) return;
    const navbar = node.querySelector(".navbar");
    const scroll = () =>
      navbar?.classList.toggle(
        "scrolled",
        navbar.classList.contains("fixed-light") || window.scrollY > 50,
      );
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.15 },
    );
    node
      .querySelectorAll(
        ".fade-in-up,.fade-in-left,.slide-in-left,.slide-in-right",
      )
      .forEach((el) => observer.observe(el));
    node.querySelectorAll(".nav-links a").forEach((a) => {
      if ((new URL(a.href).pathname.replace(/\/$/, "") || "/") === path)
        a.setAttribute("aria-current", "page");
    });
    node.querySelectorAll(".faq-item").forEach((item, i) => {
      const button = item.querySelector("button"),
        answer = item.querySelector(".faq-answer");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", `faq-answer-${i}`);
      answer.id = `faq-answer-${i}`;
      answer.setAttribute("aria-hidden", "true");
    });
    node
      .querySelectorAll(".filter-btn")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          button.classList.contains("active") ? "true" : "false",
        ),
      );
    node
      .querySelectorAll("i")
      .forEach((icon) => icon.setAttribute("aria-hidden", "true"));
    const cards = [...node.querySelectorAll(".t-card")],
      carousel = node.querySelector(".testimonial-cards");
    let current = 0,
      visible = false,
      paused = false;
    const paint = () =>
      cards.forEach((card, index) => {
        card.className = `t-card ${index === current ? "front-card" : index === (current + 1) % cards.length ? "back-card" : index === (current - 1 + cards.length) % cards.length ? "leaving-card" : "hidden-card"}`;
        card.setAttribute("aria-hidden", index === current ? "false" : "true");
      });
    const move = (direction) => {
      if (cards.length) {
        current = (current + direction + cards.length) % cards.length;
        paint();
      }
    };
    paint();
    const carouselObserver = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting;
    });
    if (carousel) carouselObserver.observe(carousel);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = setInterval(() => {
      if (visible && !paused && !document.hidden && !reduced.matches) move(1);
    }, 3500);
    const pause = () => {
        paused = true;
      },
      resume = () => {
        paused = false;
      };
    carousel?.addEventListener("pointerenter", pause);
    carousel?.addEventListener("pointerleave", resume);
    carousel?.addEventListener("focusin", pause);
    carousel?.addEventListener("focusout", resume);
    const click = (e) => {
      const trigger = e.target.closest(".quote-trigger");
      if (trigger) {
        e.preventDefault();
        openQuote(trigger.dataset.service || "", trigger);
        return;
      }
      const menu = e.target.closest(".mobile-menu-btn");
      if (menu) {
        e.preventDefault();
        menuFocus.current = menu;
        menu.setAttribute("aria-expanded", "true");
        openingQuote.current = false;
        setMenuOpen(true);
        return;
      }
      const question = e.target.closest(".faq-question");
      if (question) {
        const item = question.closest(".faq-item"),
          wasOpen = item.classList.contains("active");
        node.querySelectorAll(".faq-item").forEach((other) => {
          other.classList.remove("active");
          other.querySelector("button").setAttribute("aria-expanded", "false");
          const answer = other.querySelector(".faq-answer");
          answer.style.maxHeight = "";
          answer.setAttribute("aria-hidden", "true");
        });
        if (!wasOpen) {
          item.classList.add("active");
          question.setAttribute("aria-expanded", "true");
          const answer = item.querySelector(".faq-answer");
          answer.style.maxHeight = answer.scrollHeight + "px";
          answer.setAttribute("aria-hidden", "false");
        }
        return;
      }
      const filter = e.target.closest(".filter-btn");
      if (filter) {
        node.querySelectorAll(".filter-btn").forEach((b) => {
          const active = b === filter;
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", String(active));
        });
        node.querySelectorAll(".blog-card").forEach((card) => {
          const hidden =
            filter.dataset.filter !== "all" &&
            filter.dataset.filter !== card.dataset.category;
          card.classList.toggle("hidden", hidden);
          if (!hidden) card.classList.add("is-visible");
        });
        return;
      }
      const control = e.target.closest(".t-controls .control-btn");
      if (control) {
        const buttons = [...node.querySelectorAll(".t-controls .control-btn")];
        move(control === buttons[0] ? -1 : 1);
        return;
      }
      if (e.target.closest(".t-card")) move(1);
    };
    node.addEventListener("click", click);
    return () => {
      window.removeEventListener("scroll", scroll);
      observer.disconnect();
      carouselObserver.disconnect();
      clearInterval(timer);
      node.removeEventListener("click", click);
      carousel?.removeEventListener("pointerenter", pause);
      carousel?.removeEventListener("pointerleave", resume);
      carousel?.removeEventListener("focusin", pause);
      carousel?.removeEventListener("focusout", resume);
    };
  }, [path]);
  useEffect(() => {
    if (!contactOpen) return;
    const close = (e) => {
      if (!root.current?.querySelector(".floating-contact")?.contains(e.target))
        setContactOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") setContactOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [contactOpen]);
  return (
    <div ref={root} className={`public-site site-page-${pageClass}`}>
      <a href="#main" className="site-skip">
        Skip to content
      </a>
      <div ref={content} dangerouslySetInnerHTML={html} />
      <div className="floating-contact" id="floatingContact">
        <div
          className={`fc-menu${contactOpen ? " active" : ""}`}
          id="fcMenu"
          inert={!contactOpen}
        >
          <a
            href="tel:0430922430"
            className="fc-menu-item"
            aria-label="Call Us"
          >
            <span className="fc-tooltip">Call Us</span>
            <span className="fc-icon">
              <i className="fa-solid fa-phone" aria-hidden="true" />
            </span>
          </a>
          <a
            href="#"
            className="fc-menu-item"
            aria-label="Get Quote"
            onClick={(e) => {
              e.preventDefault();
              openQuote("", e.currentTarget);
            }}
          >
            <span className="fc-tooltip">Get Quote</span>
            <span className="fc-icon">
              <i className="fa-solid fa-file-invoice" aria-hidden="true" />
            </span>
          </a>
        </div>
        <button
          className="fc-main-btn"
          aria-label={
            contactOpen ? "Close contact options" : "Open contact options"
          }
          aria-expanded={contactOpen}
          aria-controls="fcMenu"
          onClick={() => setContactOpen(!contactOpen)}
        >
          <i
            className={`fa-solid ${contactOpen ? "fa-xmark" : "fa-phone"}`}
            aria-hidden="true"
          />
        </button>
      </div>
      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal container={root.current}>
          <Dialog.Overlay className="site-menu-backdrop" />
          <Dialog.Content
            className="mobile-nav open"
            id="mobileNav"
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              menuFocus.current?.setAttribute("aria-expanded", "false");
              if (!openingQuote.current) menuFocus.current?.focus();
            }}
          >
            <Dialog.Title className="site-sr-only">Navigation</Dialog.Title>
            <Dialog.Close className="mobile-nav-close" aria-label="Close menu">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </Dialog.Close>
            <nav aria-label="Mobile navigation">
              <ul className="mobile-nav-links">
                {links.map(([href, label]) => (
                  <li key={href}>
                    <a href={href}>{label}</a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mobile-nav-actions">
              <button
                className="btn btn-primary"
                onClick={(e) => openQuote("", e.currentTarget)}
              >
                Get Quote
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={quoteOpen}
        onOpenChange={(value) => {
          setQuoteOpen(value);
          if (!value) openingQuote.current = false;
        }}
      >
        <Dialog.Portal container={root.current}>
          <Dialog.Overlay className="modal-overlay active" />
          <Dialog.Content
            className="modal-container site-quote-dialog"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              root.current?.querySelector("#m-first_name")?.focus();
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const target = quoteFocus.current;
              const floating = target?.closest(".fc-menu");
              if (floating)
                root.current?.querySelector(".fc-main-btn")?.focus();
              else if (target?.isConnected) target.focus();
              else menuFocus.current?.focus();
            }}
          >
            <Dialog.Close className="modal-close" aria-label="Close enquiry">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </Dialog.Close>
            <div className="modal-header">
              <Dialog.Title>Request a Quote</Dialog.Title>
              <Dialog.Description>
                Fill out the form below and our estimation team will get back to
                you within 24 hours.
              </Dialog.Description>
            </div>
            <QuoteForm
              key={service}
              service={service}
              onDone={() => setQuoteOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
