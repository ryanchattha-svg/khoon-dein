# Smart Blood Bank

Deploy: push to Git, connect to Netlify, set env var `DEVICE_KEY` (long random string), deploy.
Then open /admin.html, enter the key, click "Seed leads & demo stock".
Flash `esp32_lock/esp32_lock.ino` with your Wi-Fi, site URL and the same DEVICE_KEY.
Local test: `npm i -g netlify-cli && npm i && netlify dev`.

Pages: / (PIN), /donor.html, /hospital.html, /admin.html
API: /api/issue, verify, register, seed, logs, inventory, donors, deliveries
