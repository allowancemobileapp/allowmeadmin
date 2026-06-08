import fetch from 'node-fetch';
const run = async () => {
    try {
        const res = await fetch('http://localhost:3000/api/notifications', {
            headers: { 'x-admin-email': 'allowancemobileapp@gmail.com' }
        });
        const text = await res.text();
        console.log("Response:", res.status, text);
    } catch(e) {
        console.error(e);
    }
}
run();
