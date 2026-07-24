async function run() {
    let retries = 3;
    while (retries > 0) {
        try {
            console.log("try");
            throw new Error("503");
        } catch (e) {
            retries--;
            if (retries === 0) throw e;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}
run();
