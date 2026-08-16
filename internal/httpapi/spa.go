package httpapi

import (
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const builtinLoginHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cluster Console</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 24rem; margin: 2rem auto; padding: 0 1rem; }
label { display: block; margin-top: 0.75rem; }
input { width: 100%; box-sizing: border-box; padding: 0.4rem; }
button { margin-top: 1rem; padding: 0.5rem 1rem; }
#error { color: #b00020; margin-top: 0.75rem; }
#logged-in { margin-top: 1rem; }
.hidden { display: none; }
</style>
</head>
<body>
<h1>Cluster Console</h1>
<form id="login-form">
<label>Username <input name="username" id="username" autocomplete="username" required></label>
<label>Password <input type="password" name="password" id="password" autocomplete="current-password" required></label>
<button type="submit">Log in</button>
</form>
<p id="error" class="hidden"></p>
<div id="logged-in" class="hidden">
<p><strong id="user-label"></strong> (<span id="role-label"></span>)</p>
<button type="button" id="logout-btn">Log out</button>
</div>
<script>
const loginForm = document.getElementById('login-form');
const errorEl = document.getElementById('error');
const loggedInEl = document.getElementById('logged-in');
const userLabel = document.getElementById('user-label');
const roleLabel = document.getElementById('role-label');
const logoutBtn = document.getElementById('logout-btn');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}
function hideError() {
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}
function showLoggedIn(user) {
  loginForm.classList.add('hidden');
  loggedInEl.classList.remove('hidden');
  userLabel.textContent = user.username;
  roleLabel.textContent = user.role;
}
function showLogin() {
  loginForm.classList.remove('hidden');
  loggedInEl.classList.add('hidden');
  hideError();
}

async function loadMe() {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (res.ok) {
    showLoggedIn(await res.json());
    return true;
  }
  showLogin();
  return false;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    showError('Invalid credentials');
    return;
  }
  showLoggedIn(await res.json());
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  showLogin();
  loginForm.reset();
});

loadMe();
</script>
</body>
</html>`

func registerSPARoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /", serveSPA)
}

func serveSPA(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	if root := strings.TrimSpace(os.Getenv("WEB_DIST")); root != "" {
		if serveWebDist(w, r, root) {
			return
		}
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(builtinLoginHTML))
}

func serveWebDist(w http.ResponseWriter, r *http.Request, root string) bool {
	indexPath := filepath.Join(root, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		return false
	}
	http.FileServer(http.Dir(root)).ServeHTTP(w, r)
	return true
}

func spaFS(root fs.FS) http.Handler {
	return http.FileServer(http.FS(root))
}
