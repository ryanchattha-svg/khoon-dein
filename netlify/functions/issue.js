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
        const mobile = body.mobile ? body.mobile.replace(/\D/g, "") : "";
        const bloodGroup = body.bloodGroup ? body.bloodGroup.trim() : "";

        if (!name || !cnic || !mobile || !bloodGroup) {
            return new Response(JSON.stringify({ error: "All fields are required." }), { status: 400 });
        }

        const cardsStore = getStore("cards");
        const list = await cardsStore.list();
        
        let matchedUid = null;
        for (const blob of list.blobs) {
            const rawData = await cardsStore.get(blob.key);
            if (!rawData) continue;
            const card = JSON.parse(rawData);
            
            // Check all possible field variations where CNIC might be stored
            const storedCnic = (card.cnic || card.idCard || card.cnicNumber || "").replace(/\D/g, "");
            if (storedCnic === cnic) {
                matchedUid = blob.key;
                break;
            }
        }

        if (!matchedUid) {
            return new Response(JSON.stringify({ error: "This CNIC is not registered in the system. Go to /admin and re-register your card." }), { status: 400 });
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