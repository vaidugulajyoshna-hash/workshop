import "./styles.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const USER_ID_KEY = "campus-pulse-user-id";
const app = document.querySelector("#app");

const state = {
  events: [],
  categories: [],
  category: "All events",
  view: "explore",
  registrations: [],
  userId: localStorage.getItem(USER_ID_KEY) || "",
  loading: true,
  error: "",
  notice: "",
  selectedEvent: null,
  modalError: "",
  busy: false,
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

function eventStatus(event) {
  return String(event.status || "unlisted").toLowerCase();
}

function canRegister(event) {
  return ["open", "published", "active"].includes(eventStatus(event));
}

function categoryFor(event) {
  return event.category || event.type || event.department || "Campus events";
}

function formattedDate(event) {
  const rawDate = event.starts_at || event.start_date || event.date || event.created_at;
  if (!rawDate) return "Date to be announced";
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime())
    ? escapeHtml(rawDate)
    : new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: event.starts_at ? "numeric" : undefined,
        minute: event.starts_at ? "2-digit" : undefined,
      }).format(date);
}

function safeImageUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function initialsFor(value) {
  return String(value || "CP")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function visibleEvents() {
  if (state.category === "All events") return state.events;
  return state.events.filter((event) => categoryFor(event) === state.category);
}

function eventArtwork(event, featured = false) {
  const image = safeImageUrl(event.image_url || event.cover_image || event.image);
  if (image) {
    return `<img class="event-art${featured ? " event-art--featured" : ""}" src="${escapeHtml(image)}" alt="" loading="lazy" />`;
  }
  return `<div class="event-art event-art--generated${featured ? " event-art--featured" : ""}" aria-hidden="true"><span>${escapeHtml(initialsFor(event.title))}</span><i></i><b></b></div>`;
}

function capacityMarkup(event) {
  const capacity = Number(event.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return `<span class="capacity-copy">Capacity not listed</span>`;
  }
  return `<div class="capacity-line"><span>Capacity</span><strong>${capacity.toLocaleString()} spots</strong></div>`;
}

function eventCard(event, index) {
  const title = escapeHtml(event.title || "Untitled event");
  const category = escapeHtml(categoryFor(event));
  const status = escapeHtml(eventStatus(event));
  const eventId = escapeHtml(event.id || "");
  const location = escapeHtml(event.location || event.venue || "Location to be announced");
  const registerLabel = canRegister(event) ? "Register" : "Not accepting registrations";

  return `<article class="event-row" style="--row-index:${index}">
    <button class="event-row__art" data-action="details" data-event-id="${eventId}" aria-label="View ${title}">${eventArtwork(event)}</button>
    <div class="event-row__content">
      <div class="event-row__eyebrow"><span>${category}</span><span class="status-dot status-dot--${status}">${status}</span></div>
      <h3>${title}</h3>
      <p class="event-row__meta">${escapeHtml(formattedDate(event))}<span aria-hidden="true">·</span>${location}</p>
      ${capacityMarkup(event)}
    </div>
    <button class="button button--quiet event-row__action" data-action="details" data-event-id="${eventId}" ${eventId ? "" : "disabled"}>${registerLabel === "Register" ? "View & register" : "Details"}</button>
  </article>`;
}

function featuredCard(event) {
  if (!event) return "";
  const title = escapeHtml(event.title || "Untitled event");
  const category = escapeHtml(categoryFor(event));
  const eventId = escapeHtml(event.id || "");
  const status = canRegister(event) ? "Registration open" : `Status: ${escapeHtml(eventStatus(event))}`;
  const location = escapeHtml(event.location || event.venue || "Campus location to be announced");

  return `<article class="featured-event">
    <div class="featured-event__image">${eventArtwork(event, true)}<span class="image-tag">${category}</span></div>
    <div class="featured-event__body">
      <div class="featured-event__topline"><span class="eyebrow">Featured event</span><span class="live-label"><i></i>${status}</span></div>
      <h2>${title}</h2>
      <p class="featured-event__meta">${escapeHtml(formattedDate(event))}<span aria-hidden="true">·</span>${location}</p>
      <p class="featured-event__description">${escapeHtml(event.description || "Find your people, try something new, and make campus yours.")}</p>
      <div class="featured-event__footer"><span class="featured-event__capacity">${capacityMarkup(event)}</span><button class="button button--primary" data-action="details" data-event-id="${eventId}" ${eventId ? "" : "disabled"}>Explore event <span aria-hidden="true">↗</span></button></div>
    </div>
  </article>`;
}

function accountPanel() {
  return `<form class="account-panel" id="account-form">
    <div class="account-panel__mark" aria-hidden="true">${state.userId ? escapeHtml(initialsFor(state.userId)) : "ID"}</div>
    <div class="account-panel__copy"><strong>Your campus account</strong><span>${state.userId ? "Saved on this device" : "Add your Supabase user UUID to register and view passes"}</span></div>
    <label class="visually-hidden" for="user-id">Supabase user UUID</label>
    <input id="user-id" name="user_id" type="text" inputmode="text" autocomplete="off" placeholder="Supabase user UUID" value="${escapeHtml(state.userId)}" />
    <button class="button button--quiet" type="submit">Save ID</button>
  </form>`;
}

function registrationView() {
  if (!state.userId) {
    return `<div class="empty-state"><span class="empty-state__symbol">ID</span><h2>Connect your campus account</h2><p>Enter your existing Supabase user UUID above to load registrations linked to your account.</p></div>`;
  }
  if (state.loading) return `<div class="loading-state"><span class="loader"></span><p>Loading your passes</p></div>`;
  if (state.error) return `<div class="empty-state empty-state--error"><h2>Could not load passes</h2><p>${escapeHtml(state.error)}</p><button class="button button--quiet" data-action="retry-registrations">Try again</button></div>`;
  if (!state.registrations.length) {
    return `<div class="empty-state"><span class="empty-state__symbol">0</span><h2>No passes yet</h2><p>Events you register for will appear here.</p><button class="button button--quiet" data-action="explore">Explore events</button></div>`;
  }
  return `<div class="event-list">${state.registrations.map((registration, index) => {
    const event = registration.events || registration.event || registration;
    return eventCard({ ...event, status: event.status || "registered" }, index);
  }).join("")}</div>`;
}

function modalMarkup() {
  const event = state.selectedEvent;
  if (!event) return "";
  const title = escapeHtml(event.title || "Untitled event");
  const id = escapeHtml(event.id || "");
  const isRegistered = state.registrations.some((registration) => registration.event_id === event.id);
  const canJoin = canRegister(event) && !isRegistered;
  const userPrompt = state.userId
    ? ""
    : `<div class="modal__account"><label for="modal-user-id">Supabase user UUID</label><div><input id="modal-user-id" type="text" autocomplete="off" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"><button class="button button--quiet" data-action="save-modal-user">Save ID</button></div></div>`;
  const error = state.modalError ? `<p class="form-error" role="alert">${escapeHtml(state.modalError)}</p>` : "";
  const success = state.notice ? `<p class="form-success" role="status">${escapeHtml(state.notice)}</p>` : "";

  return `<div class="modal-backdrop" data-action="close-modal">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-modal-content>
      <button class="modal__close" data-action="close-modal" aria-label="Close event details">×</button>
      <div class="modal__art">${eventArtwork(event, true)}</div>
      <div class="modal__body"><span class="eyebrow">${escapeHtml(categoryFor(event))}</span>
        <h2 id="modal-title">${title}</h2>
        <p class="modal__meta">${escapeHtml(formattedDate(event))}<span aria-hidden="true">·</span>${escapeHtml(event.location || event.venue || "Location to be announced")}</p>
        <p class="modal__description">${escapeHtml(event.description || "Event details will be shared by the organizer.")}</p>
        <div class="modal__facts">${capacityMarkup(event)}<span class="status-dot status-dot--${escapeHtml(eventStatus(event))}">${escapeHtml(eventStatus(event))}</span></div>
        ${userPrompt}${error}${success}
        <div class="modal__actions"><button class="button button--quiet" data-action="close-modal">Close</button>
          <button class="button button--primary" data-action="register" data-event-id="${id}" ${canJoin && state.userId && !state.busy ? "" : "disabled"}>${state.busy ? "Registering…" : isRegistered ? "Registered" : canJoin ? "Register for event" : "Registration unavailable"}</button>
        </div>
      </div>
    </section>
  </div>`;
}

function render() {
  const events = visibleEvents();
  const featured = events[0];
  const list = events.slice(featured ? 1 : 0);
  const categories = ["All events", ...state.categories];
  const nav = `<nav class="view-tabs" aria-label="Campus Pulse sections">
    <button class="view-tab ${state.view === "explore" ? "is-active" : ""}" data-action="explore">Explore</button>
    <button class="view-tab ${state.view === "passes" ? "is-active" : ""}" data-action="passes">My passes${state.registrations.length ? `<span class="tab-count">${state.registrations.length}</span>` : ""}</button>
  </nav>`;

  app.innerHTML = `<div class="site-shell">
    <header class="topbar"><a class="brand" href="#" data-action="explore" aria-label="Campus Pulse home"><span class="brand__symbol">C<span></span></span><span>campus<span class="brand__light">pulse</span></span></a>
      ${nav}<div class="topbar__account"><span class="online-indicator"></span><span>${state.userId ? "Account connected" : "Campus events"}</span><span class="avatar">${state.userId ? escapeHtml(initialsFor(state.userId)) : "CP"}</span></div>
    </header>
    <main>
      <section class="intro"><div><p class="eyebrow">CAMPUS LIFE, IN MOTION</p><h1>${state.view === "explore" ? "Find your next\nfavorite thing." : "Your campus\npasses."}</h1><p class="intro__copy">${state.view === "explore" ? "Good people. Great plans. It all starts here." : "Every event you have registered for, together."}</p></div><div class="intro__stamp" aria-hidden="true"><span>YOUR</span><strong>CAMPUS<br />AWAITS</strong><i>✳</i></div></section>
      ${accountPanel()}
      ${state.notice && !state.selectedEvent ? `<p class="global-notice" role="status">${escapeHtml(state.notice)}</p>` : ""}
      ${state.view === "explore" ? `<section class="explore-section" aria-labelledby="events-heading">
        <div class="section-heading"><div><p class="eyebrow">HAPPENING AROUND YOU</p><h2 id="events-heading">Explore events <span class="event-count">${state.events.length}</span></h2></div><button class="refresh-button" data-action="refresh" ${state.loading ? "disabled" : ""}>↻ <span>Refresh</span></button></div>
        <div class="category-tabs" role="group" aria-label="Filter events">${categories.map((category) => `<button class="category-tab ${state.category === category ? "is-active" : ""}" data-action="category" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</div>
        ${state.loading ? `<div class="loading-state"><span class="loader"></span><p>Finding events on campus</p></div>` : state.error ? `<div class="empty-state empty-state--error"><h2>We couldn’t reach the event list</h2><p>${escapeHtml(state.error)}</p><button class="button button--quiet" data-action="refresh">Retry</button></div>` : !events.length ? `<div class="empty-state"><span class="empty-state__symbol">✳</span><h2>No events to show</h2><p>There aren’t any events in this view yet.</p></div>` : `<div class="events-layout">${featuredCard(featured)}<section class="upcoming-section"><div class="section-heading section-heading--compact"><div><p class="eyebrow">MORE TO DISCOVER</p><h2>On the calendar</h2></div><span class="upcoming-count">${list.length} ${list.length === 1 ? "event" : "events"}</span></div>${list.length ? `<div class="event-list">${list.map(eventCard).join("")}</div>` : `<p class="list-note">You’re all caught up. Check back for more campus events.</p>`}</section></div>`}
      </section>` : `<section class="passes-section" aria-labelledby="passes-heading"><div class="section-heading"><div><p class="eyebrow">YOUR PLANS</p><h2 id="passes-heading">My passes</h2></div><span class="upcoming-count">${state.registrations.length} saved</span></div>${registrationView()}</section>`}
    </main>
    <footer class="footer"><span>Campus Pulse</span><span>Make campus yours.</span></footer>
  </div>${modalMarkup()}`;
}

async function loadEvents() {
  state.loading = true;
  state.error = "";
  render();
  try {
    const result = await request("/api/events");
    state.events = Array.isArray(result) ? result : [];
    state.categories = [...new Set(state.events.map(categoryFor))];
    if (!state.categories.includes(state.category)) state.category = "All events";
  } catch (error) {
    state.error = error.message.includes("permission denied")
      ? `${error.message}. Supabase is reachable, but the API key's database role cannot read events. Check its table grants and RLS SELECT policy.`
      : `${error.message}. Check that the Flask backend is running and Supabase is configured.`;
  } finally {
    state.loading = false;
    render();
  }
}

async function loadRegistrations() {
  if (!state.userId) {
    state.registrations = [];
    state.error = "";
    render();
    return;
  }
  state.loading = true;
  state.error = "";
  render();
  try {
    const query = new URLSearchParams({ user_id: state.userId });
    const result = await request(`/api/me/registrations?${query}`);
    state.registrations = Array.isArray(result) ? result : [];
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function openEvent(eventId) {
  if (!eventId) return;
  state.modalError = "";
  state.notice = "";
  try {
    state.selectedEvent = await request(`/api/events/${encodeURIComponent(eventId)}`);
    render();
    document.querySelector(".modal__close")?.focus();
  } catch (error) {
    state.notice = error.message;
    render();
  }
}

async function registerForEvent(eventId) {
  if (!state.userId) {
    state.modalError = "Save your Supabase user UUID above before registering.";
    render();
    return;
  }
  state.busy = true;
  state.modalError = "";
  render();
  try {
    const registration = await request("/api/registrations", {
      method: "POST",
      body: JSON.stringify({ user_id: state.userId, event_id: eventId }),
    });
    state.registrations = [...state.registrations, registration];
    state.notice = "You’re registered. Your pass is ready.";
    if (state.view === "passes") await loadRegistrations();
  } catch (error) {
    state.modalError = error.message;
  } finally {
    state.busy = false;
    render();
  }
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

app.addEventListener("submit", async (event) => {
  if (event.target.id !== "account-form") return;
  event.preventDefault();
  const form = new FormData(event.target);
  const userId = String(form.get("user_id") || "").trim();
  if (userId && !validUuid(userId)) {
    state.notice = "Enter a valid UUID from your existing Supabase user record.";
    render();
    return;
  }
  state.userId = userId;
  state.notice = userId ? "Campus account saved on this device." : "Campus account removed from this device.";
  if (userId) localStorage.setItem(USER_ID_KEY, userId);
  else localStorage.removeItem(USER_ID_KEY);
  if (state.view === "passes") await loadRegistrations();
  else render();
});

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "close-modal") {
    state.selectedEvent = null;
    state.modalError = "";
    state.notice = "";
    render();
  } else if (action === "details") {
    await openEvent(button.dataset.eventId);
  } else if (action === "register") {
    await registerForEvent(button.dataset.eventId);
  } else if (action === "save-modal-user") {
    const userId = document.querySelector("#modal-user-id")?.value.trim() || "";
    if (!validUuid(userId)) {
      state.modalError = "Enter a valid UUID from your existing Supabase user record.";
    } else {
      state.userId = userId;
      localStorage.setItem(USER_ID_KEY, userId);
      state.modalError = "";
      state.notice = "Campus account saved on this device.";
    }
    render();
  } else if (action === "category") {
    state.category = button.dataset.category;
    render();
  } else if (action === "refresh") {
    await loadEvents();
  } else if (action === "explore") {
    state.view = "explore";
    state.error = "";
    render();
  } else if (action === "passes") {
    state.view = "passes";
    await loadRegistrations();
  } else if (action === "retry-registrations") {
    await loadRegistrations();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.selectedEvent) {
    state.selectedEvent = null;
    state.modalError = "";
    state.notice = "";
    render();
  }
});

render();
loadEvents();