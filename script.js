/* script.js
   Plain JS, ES6+, works across project pages.
   Uses OMDb API (demo key). Replace key if desired.
*/

// ---------- CONFIG ----------
const OMDB_KEY = "564727fa"; // demo key; replace if you have a better key
const OMDB_BASE = `https://www.omdbapi.com/?apikey=${OMDB_KEY}`;

// ---------- shared utilities ----------
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

// Debounce helper (small)
function debounce(fn, wait = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// ---------- state ----------
let currentQuery = "Avengers";
let currentPage = 1;
let loading = false;
let favourites = JSON.parse(localStorage.getItem("movie_explorer_favs") || "[]");

// ---------- DOM refs (may be null on some pages) ----------
const moviesGrid = $("#moviesGrid");
const searchForm = $("#searchForm");
const searchInput = $("#searchInput");
const loadMoreBtn = $("#loadMoreBtn");
const messageEl = $("#message");
const favouritesGrid = $("#favouritesGrid");
const noFavMsg = $("#noFavMsg");
const movieDetailsEl = $("#movieDetails");
const contactForm = $("#contactForm");
const contactStatus = $("#contactStatus");

// ---------- fetch helpers ----------
async function apiSearch(q, page = 1) {
    const url = `${OMDB_BASE}&s=${encodeURIComponent(q)}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network response not ok");
    const data = await res.json();
    return data; // contains Response, Search array, totalResults
}
async function apiGetById(id) {
    const url = `${OMDB_BASE}&i=${encodeURIComponent(id)}&plot=full`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network response not ok");
    return res.json();
}

// ---------- UI helpers ----------
function showMessage(msg) {
    if (!messageEl) return;
    messageEl.textContent = msg || "";
}
function clearGrid(grid) {
    if (!grid) return;
    grid.innerHTML = "";
}
function createMovieCard(movie, opts = { showDetails: true, showFav: true }) {
    // movie: object from OMDb (Title, Year, imdbID, Poster)
    const card = el("article", "movie-card");
    const img = el("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = movie.Title;
    img.src = (movie.Poster && movie.Poster !== "N/A") ? movie.Poster : "https://via.placeholder.com/400x600?text=No+Image";
    card.appendChild(img);

    const title = el("h3"); title.textContent = movie.Title;
    card.appendChild(title);

    const meta = el("div", "meta");
    meta.textContent = movie.Year || "";
    card.appendChild(meta);

    const actions = el("div", "card-actions");

    if (opts.showDetails) {
        const btnDetail = el("button", "btn btn-primary");
        btnDetail.textContent = "Details";
        btnDetail.setAttribute("aria-label", `View details of ${movie.Title}`);
        btnDetail.addEventListener("click", () => {
            // store selected and go to details page
            localStorage.setItem("movie_explorer_selected", movie.imdbID);
            // navigate
            window.location.href = "movie-details.html";
        });
        actions.appendChild(btnDetail);
    }

    if (opts.showFav) {
        const favBtn = el("button", "btn btn-fav");
        const isFav = favourites.some(f => f.imdbID === movie.imdbID);
        favBtn.textContent = isFav ? "Remove Fav" : "Add Fav";
        favBtn.addEventListener("click", async () => {
            toggleFavourite(movie);
            favBtn.textContent = favourites.some(f => f.imdbID === movie.imdbID) ? "Remove Fav" : "Add Fav";
            // if on favourites page, re-render
            if (window.location.pathname.includes("favourites.html")) renderFavourites();
        });
        actions.appendChild(favBtn);
    }

    card.appendChild(actions);
    return card;
}

// ---------- core renderers ----------
async function renderSearchResults(q, page = 1) {
    if (!moviesGrid) return;
    if (loading) return;
    loading = true;
    showMessage("Loading...");
    try {
        const data = await apiSearch(q, page);
        if (data.Response === "True") {
            showMessage("");
            // if page 1 and grid empty, clear first
            if (page === 1) clearGrid(moviesGrid);
            data.Search.forEach(m => {
                const card = createMovieCard(m, { showDetails: true, showFav: true });
                moviesGrid.appendChild(card);
            });
            // show load more if multiple pages possible
            const total = parseInt(data.totalResults || "0", 10);
            const pages = Math.ceil(total / 10);
            if (page < pages) {
                if (loadMoreBtn) loadMoreBtn.style.display = "inline-block";
            } else {
                if (loadMoreBtn) loadMoreBtn.style.display = "none";
            }
        } else {
            clearGrid(moviesGrid);
            showMessage(`Movie "${q}" not found.`);
            if (loadMoreBtn) loadMoreBtn.style.display = "none";
        }
    } catch (err) {
        console.error(err);
        showMessage("Error fetching movies. Try again.");
    } finally {
        loading = false;
    }
}

function renderFavourites() {
    if (!favouritesGrid) return;
    clearGrid(favouritesGrid);
    const list = favourites || [];
    if (list.length === 0) {
        if (noFavMsg) noFavMsg.style.display = "block";
        return;
    }
    if (noFavMsg) noFavMsg.style.display = "none";
    list.forEach(m => {
        const card = createMovieCard(m, { showDetails: true, showFav: true });
        favouritesGrid.appendChild(card);
    });
}

// ---------- favourites management ----------
function toggleFavourite(movie) {
    // movie can be object or minimal (imdbID) if called from details page
    const id = movie.imdbID || movie;
    // if movie is only id, fetch details
    if (typeof movie === "string" || typeof movie === "number") {
        // remove if exists
        favourites = favourites.filter(f => f.imdbID !== id);
        localStorage.setItem("movie_explorer_favs", JSON.stringify(favourites));
        return;
    }
    // exists?
    const exists = favourites.some(f => f.imdbID === movie.imdbID);
    if (exists) {
        favourites = favourites.filter(f => f.imdbID !== movie.imdbID);
    } else {
        // store minimal useful fields
        const item = {
            imdbID: movie.imdbID,
            Title: movie.Title,
            Year: movie.Year,
            Poster: movie.Poster
        };
        favourites.unshift(item);
    }
    localStorage.setItem("movie_explorer_favs", JSON.stringify(favourites));
}

// ---------- details page renderer ----------
async function renderMovieDetailsPage() {
    if (!movieDetailsEl) return;
    const id = localStorage.getItem("movie_explorer_selected");
    if (!id) {
        movieDetailsEl.innerHTML = "<p class='message'>No movie selected.</p>";
        return;
    }
    movieDetailsEl.innerHTML = "<p class='message'>Loading details…</p>";
    try {
        const data = await apiGetById(id);
        if (data && data.Response === "True") {
            const wrapper = el("div", "movie-details");
            const img = el("img"); img.src = (data.Poster && data.Poster !== "N/A") ? data.Poster : "https://via.placeholder.com/600x900";
            img.alt = data.Title;
            wrapper.appendChild(img);

            const details = el("div", "details");
            const h = el("h2"); h.textContent = `${data.Title} (${data.Year})`;
            details.appendChild(h);
            const pDesc = el("p"); pDesc.innerHTML = `<strong>Plot:</strong> ${data.Plot}`;
            const pGenre = el("p"); pGenre.innerHTML = `<strong>Genre:</strong> ${data.Genre}`;
            const pDirector = el("p"); pDirector.innerHTML = `<strong>Director:</strong> ${data.Director}`;
            const pActors = el("p"); pActors.innerHTML = `<strong>Actors:</strong> ${data.Actors}`;
            const pRating = el("p"); pRating.innerHTML = `<strong>IMDB Rating:</strong> ${data.imdbRating}`;

            const actions = el("div", "card-actions");
            const favBtn = el("button", "btn btn-fav");
            const isFav = favourites.some(f => f.imdbID === data.imdbID);
            favBtn.textContent = isFav ? "Remove Favourite" : "Add Favourite";
            favBtn.addEventListener("click", () => {
                toggleFavourite(data);
                favBtn.textContent = favourites.some(f => f.imdbID === data.imdbID) ? "Remove Favourite" : "Add Favourite";
            });

            const backBtn = el("button", "btn btn-primary");
            backBtn.textContent = "Back";
            backBtn.addEventListener("click", () => window.history.back());

            actions.appendChild(favBtn); actions.appendChild(backBtn);

            details.appendChild(pDesc); details.appendChild(pGenre); details.appendChild(pDirector); details.appendChild(pActors); details.appendChild(pRating); details.appendChild(actions);
            wrapper.appendChild(details);

            movieDetailsEl.innerHTML = "";
            movieDetailsEl.appendChild(wrapper);
        } else {
            movieDetailsEl.innerHTML = `<p class="message">Details not available.</p>`;
        }
    } catch (err) {
        console.error(err);
        movieDetailsEl.innerHTML = `<p class="message">Failed to load details.</p>`;
    }
}

// ---------- contact form handling ----------
function initContactForm() {
    if (!contactForm) return;
    contactForm.addEventListener("submit", function (e) {
        e.preventDefault();
        // very simple client-side validation
        const name = $("#contactName").value.trim();
        const email = $("#contactEmail").value.trim();
        const message = $("#contactMessage").value.trim();
        if (!name || !email || !message) {
            if (contactStatus) contactStatus.textContent = "Please fill all fields.";
            return;
        }
        // "send" (demo): we show success and reset
        if (contactStatus) contactStatus.textContent = "Message sent (demo). Thank you!";
        contactForm.reset();
    });
}

// ---------- initialization ----------
document.addEventListener("DOMContentLoaded", () => {
    // restore favourites
    favourites = JSON.parse(localStorage.getItem("movie_explorer_favs") || "[]");

    // If on index/home
    if (moviesGrid) {
        // initial load
        currentQuery = "Avengers";
        currentPage = 1;
        renderSearchResults(currentQuery, currentPage);

        // search form
        if (searchForm) {
            searchForm.addEventListener("submit", (ev) => {
                ev.preventDefault();
                const q = (searchInput && searchInput.value.trim()) || "";
                if (!q) return;
                currentQuery = q;
                currentPage = 1;
                renderSearchResults(currentQuery, currentPage);
            });

            // nice: live search debounce (optional)
            if (searchInput) {
                const deb = debounce(() => {
                    const q = searchInput.value.trim();
                    if (q) {
                        currentQuery = q; currentPage = 1; renderSearchResults(currentQuery, currentPage);
                    }
                }, 700);
                searchInput.addEventListener("input", () => { deb(); });
            }
        }

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener("click", () => {
                currentPage++;
                renderSearchResults(currentQuery, currentPage);
            });
        }
    }

    // If on favourites page
    if (favouritesGrid) {
        renderFavourites();
    }

    // If on movie-details page
    if (movieDetailsEl) {
        renderMovieDetailsPage();
    }

    // Contact form
    initContactForm();
});
