import fetch from 'node-fetch';
const run = async () => {
    try {
        const res = await fetch('http://localhost:3000/api/notifications', {
            method: 'POST',
            headers: { 'x-admin-email': 'allowancemobileapp@gmail.com', 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'Test Notif', message: 'This is a test notification.' })
        });
        const text = await res.text();
        console.log("Response:", res.status, text);
    } catch(e) {
        console.error(e);
    }
}
run();
