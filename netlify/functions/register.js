import { getStore } from "@netlify/blobs";

export default async (req) => {
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
    }

    try {
        const authHeader = req.headers.get("authorization") || "";
        const token = authHeader.replace("Bearer ", "").trim();
        const DEVICE_KEY = process.env.DEVICE_KEY || "mK29xPq7vL4tR8wZ";

        if (token !== DEVICE_KEY) {
            return new Response(JSON.stringify({ error: "Unauthorized access" }), { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const uid = body.uid ? body.uid.trim().toUpperCase() : "";
        const name = body.name ? body.name.trim() : "";
        const cnic = body.cnic ? body.cnic.replace(/\D/g, "") : "";
        const mobile = body.mobile ? body.mobile.replace(/\D/g, "") : (body.phone ? body.phone.replace(/\D/g, "") : "");
        const bloodGroup = body.bloodGroup ? body.bloodGroup.trim() : (body.blood ? body.blood.trim() : "");

        if (!uid || uid.length < 8) {
            return new Response(JSON.stringify({ error: "Valid Card UID required." }), { status: 400 });
        }
        if (!name) {
            return new Response(JSON.stringify({ error: "Name required." }), { status: 400 });
        }
        if (cnic.length !== 13) {
            return new Response(JSON.stringify({ error: "13-digit CNIC required." }), { status: 400 });
        }

        const cardsStore = getStore("cards");
        
        // Save card details with explicit keys matching issue.js lookup
        const cardRecord = {
            uid: uid,
            name: name,
            cnic: cnic,
            mobile: mobile,
            bloodGroup: bloodGroup,
            registeredAt: Date.now()
        };

        await cardsStore.set(uid, JSON.stringify(cardRecord));

        return new Response(JSON.stringify({ success: true, message: "Card registered successfully!" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: "Server error: " + err.message }), { status: 500 });
    }
};