import { getStore } from "@netlify/blobs";
import crypto from "crypto";

export default async (req) => {
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const name = body.name ? body.name.trim() : "";
        const cnic = body.cnic ? body.cnic.replace(/\D/g, "") : "";
        const mobile = body.phone ? body.phone.replace(/\D/g, "") : "";
        const bloodGroup = body.blood ? body.blood.trim() : "";

        if (!name || name.length < 3) {
            return new Response(JSON.stringify({ error: "Enter your full name." }), { status: 400 });
        }
        if (cnic.length !== 13) {
            return new Response(JSON.stringify({ error: "CNIC must be 13 digits." }), { status: 400 });
        }
        if (!mobile || mobile.length < 10) {
            return new Response(JSON.stringify({ error: "Enter a valid mobile number." }), { status: 400 });
        }
        if (!bloodGroup) {
            return new Response(JSON.stringify({ error: "Choose a blood group." }), { status: 400 });
        }

        const cardsStore = getStore("cards");
        const keys = await cardsStore.list();
        
        let matchedUid = null;
        for (const k of keys.blobs) {
            const cardData = JSON.parse(await cardsStore.get(k.key));
            if (cardData.cnic === cnic) {
                matchedUid = k.key;
                break;
            }
        }

        if (!matchedUid) {
            return new Response(JSON.stringify({ error: "This CNIC is not registered. Ask the admin to register your card first." }), { status: 400 });
        }

        const card = JSON.parse(await cardsStore.get(matchedUid));
        if (card.name.toLowerCase() !== name.toLowerCase()) {
            return new Response(JSON.stringify({ error: "Details do not match the registered card." }), { status: 400 });
        }

        // Generate safe 4-digit code using: 1, 2, 4, 5, 7, 8
        const safeKeys = [1, 2, 4, 5, 7, 8];
        let code = "";
        for (let i = 0; i < 4; i++) {
            code += safeKeys[crypto.randomInt(0, safeKeys.length)];
        }

        const codesStore = getStore("codes");
        await codesStore.set(matchedUid, JSON.stringify({
            code: code,
            tries: 0,
            name: name,
            phone: mobile,
            blood: bloodGroup,
            at: Date.now(),
            exp: Date.now() + 10 * 60 * 1000
        }));

        return new Response(JSON.stringify({ code: code, minutes: 10 }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: "Server error: " + err.message }), { status: 500 });
    }
};