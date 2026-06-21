var qrcode = new QRCode("test", {
  text: "http://jindo.dev.naver.com/collie",
  width: 128,
  height: 128,
  colorDark: "#000000",
  colorLight: "#ffffff",
  correctLevel: QRCode.CorrectLevel.H,
});

/**
 * OFFLINE QR TRADE LOGIC
 * ----------------------
 * Two-step handshake for in-person prize trading via QR codes.
 * No server, no DB. Each device is the source of truth for its OWN
 * collection only. Trust between devices comes from an HMAC signature,
 * not encryption — the payload is just base64, not secret.
 *
 * Flow:
 *   1. Giver calls createOffer() -> gets a signed string -> renders as QR
 *      (giver's device removes the prize from local storage immediately)
 *   2. Receiver scans it, calls verifyOffer() to check signature + expiry
 *   3. Receiver calls createAccept() -> gets a signed string -> renders as QR
 *      (receiver's device adds the prize to local storage immediately)
 *   4. Giver scans that, calls verifyAccept() to confirm the loop closed
 *
 * Each side only ever trusts a SIGNED, UNEXPIRED message — never a raw
 * claim from the other device.
 */

// -----------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------

// Baked into the client bundle. This stops casual tampering / forged
// payloads from devices not running your game code. It is NOT secret
// from a determined reverse-engineer of your own JS — treat it as a
// shared "house rule" between legitimate clients, not real cryptography.
const SHARED_SECRET = "75it78=(92832mj0t3%9jmc40jgugfbfncm0j,3.kxzk-x:";

// How long a QR is valid for scanning, in milliseconds.
// 30-45s is plenty for "hold phone up, other person scans."
const OFFER_TTL_MS = 30_000;

// -----------------------------------------------------------------------
// CRYPTO HELPERS (Web Crypto API — works fully offline, no deps)
// -----------------------------------------------------------------------

async function getHmacKey() {
  const keyData = new TextEncoder().encode(SHARED_SECRET);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payloadObj) {
  const key = await getHmacKey();
  const json = JSON.stringify(payloadObj);
  const data = new TextEncoder().encode(json);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, data);
  const sig = bufferToBase64Url(sigBuffer);
  const body = stringToBase64Url(json);
  return `${body}.${sig}`;
}

async function verifySignedString(signedString) {
  const parts = signedString.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "MALFORMED" };
  }
  const [body, sig] = parts;

  let json, payload;
  try {
    json = base64UrlToString(body);
    payload = JSON.parse(json);
  } catch {
    return { valid: false, reason: "MALFORMED" };
  }

  const key = await getHmacKey();
  const data = new TextEncoder().encode(json);
  const sigBuffer = base64UrlToBuffer(sig);

  const signatureOk = await crypto.subtle.verify("HMAC", key, sigBuffer, data);
  if (!signatureOk) {
    return { valid: false, reason: "BAD_SIGNATURE", payload };
  }

  if (typeof payload.expiresAt !== "number" || Date.now() > payload.expiresAt) {
    return { valid: false, reason: "EXPIRED", payload };
  }

  return { valid: true, payload };
}

// base64url helpers (no padding, URL-safe — keeps QR payload shorter)
function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function stringToBase64Url(str) {
  return bufferToBase64Url(new TextEncoder().encode(str));
}

function base64UrlToBuffer(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToString(b64url) {
  return new TextDecoder().decode(base64UrlToBuffer(b64url));
}

function uuid() {
  return crypto.randomUUID();
}

// -----------------------------------------------------------------------
// LOCAL COLLECTION (stand-in for "the database" — each device only
// ever edits its OWN collection, never trusts the other device's state)
// -----------------------------------------------------------------------

const Collection = {
  STORAGE_KEY: "prizeCollection",

  load() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },

  save(items) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
  },

  has(prizeId) {
    return this.load().some((p) => p.prizeId === prizeId);
  },

  remove(prizeId) {
    const items = this.load().filter((p) => p.prizeId !== prizeId);
    this.save(items);
  },

  add(prize) {
    const items = this.load();
    items.push(prize);
    this.save(items);
  },
};

// -----------------------------------------------------------------------
// STEP 1 — GIVER: create a signed OFFER for a prize they own
// -----------------------------------------------------------------------

async function createOffer({ prizeId, prizeName, fromId, fromName }) {
  if (!Collection.has(prizeId)) {
    throw new Error(`You don't own prize ${prizeId} — can't offer it.`);
  }

  const now = Date.now();
  const payload = {
    type: "OFFER",
    tradeId: uuid(),
    prizeId,
    prizeName,
    fromId,
    fromName,
    issuedAt: now,
    expiresAt: now + OFFER_TTL_MS,
  };

  const signed = await signPayload(payload);

  // Remove from giver's local collection the moment the offer is made.
  // This is the "delete after offering" behavior you wanted — but it's
  // a local-storage write, not a server call, so it's instant & offline.
  Collection.remove(prizeId);

  return { signed, payload }; // `signed` is what you encode into the QR
}

// -----------------------------------------------------------------------
// STEP 2 — RECEIVER: scan + verify the OFFER
// -----------------------------------------------------------------------

async function verifyOffer(scannedString) {
  const result = await verifySignedString(scannedString);

  if (!result.valid) {
    return result; // { valid: false, reason: "EXPIRED" | "BAD_SIGNATURE" | "MALFORMED" }
  }
  if (result.payload.type !== "OFFER") {
    return { valid: false, reason: "WRONG_TYPE", payload: result.payload };
  }
  return result; // { valid: true, payload: { tradeId, prizeId, prizeName, fromId, fromName, ... } }
}

// -----------------------------------------------------------------------
// STEP 3 — RECEIVER: accept a verified offer (adds prize, then signs an
// ACCEPT message the giver can optionally verify too)
// -----------------------------------------------------------------------

async function createAccept(offerPayload, { toId, toName }) {
  // Add the prize to the receiver's own local collection now.
  Collection.add({
    prizeId: offerPayload.prizeId,
    prizeName: offerPayload.prizeName,
    receivedFrom: offerPayload.fromName,
    receivedAt: Date.now(),
  });

  const now = Date.now();
  const payload = {
    type: "ACCEPT",
    tradeId: offerPayload.tradeId, // ties this ACCEPT back to the original OFFER
    prizeId: offerPayload.prizeId,
    toId,
    toName,
    issuedAt: now,
    expiresAt: now + OFFER_TTL_MS,
  };

  const signed = await signPayload(payload);
  return { signed, payload };
}

// -----------------------------------------------------------------------
// STEP 4 — GIVER: scan + verify the ACCEPT (closes the loop)
// -----------------------------------------------------------------------

async function verifyAccept(scannedString, expectedTradeId) {
  const result = await verifySignedString(scannedString);

  if (!result.valid) {
    return result;
  }
  if (result.payload.type !== "ACCEPT") {
    return { valid: false, reason: "WRONG_TYPE", payload: result.payload };
  }
  if (result.payload.tradeId !== expectedTradeId) {
    return {
      valid: false,
      reason: "TRADE_ID_MISMATCH",
      payload: result.payload,
    };
  }
  return result; // { valid: true, payload: { tradeId, prizeId, toId, toName, ... } }
}

// -----------------------------------------------------------------------
// USAGE EXAMPLE (simulating both devices in one script — in real use,
// `offerString` and `acceptString` are what you'd encode/decode via
// qrcode.js and a camera-scanning lib like jsQR, instead of passed
// directly like this)
// -----------------------------------------------------------------------

async function demo() {
  // Seed device A's collection with a prize to trade away.
  Collection.save([{ prizeId: "prize_042", prizeName: "Golden Compass" }]);

  // --- Device A (giver) ---
  const { signed: offerString, payload: offerPayload } = await createOffer({
    prizeId: "prize_042",
    prizeName: "Golden Compass",
    fromId: "device-A",
    fromName: "Alice",
  });
  console.log("QR content for Device A to display:\n", offerString);

  // --- Device B (receiver) scans that QR ---
  const offerCheck = await verifyOffer(offerString);
  if (!offerCheck.valid) {
    console.log("Rejected offer:", offerCheck.reason);
    return;
  }

  const { signed: acceptString, payload: acceptPayload } = await createAccept(
    offerCheck.payload,
    { toId: "device-B", toName: "Bob" },
  );
  console.log("QR content for Device B to display back:\n", acceptString);

  // --- Device A scans Device B's accept QR to close the loop ---
  const acceptCheck = await verifyAccept(acceptString, offerPayload.tradeId);
  console.log("Final result on Device A:", acceptCheck);
}

// Uncomment to run in a browser console:
// demo();

export {
  createOffer,
  verifyOffer,
  createAccept,
  verifyAccept,
  Collection,
  OFFER_TTL_MS,
};
