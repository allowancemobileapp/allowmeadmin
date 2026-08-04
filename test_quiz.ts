async function run() {
  const res = await fetch("http://localhost:3000/api/library/quiz_questions/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-email": "allowancemobileapp@gmail.com"
    },
    body: JSON.stringify({
      course_id: 1,
      material_id: 1,
      file_url: null
    })
  });
  console.log(res.status);
  console.log(await res.text());
}
run();
