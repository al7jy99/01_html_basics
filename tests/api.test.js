const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const seedFile = path.join(__dirname, '..', 'data', 'lms-data.json');

async function startTestServer() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'learnflow-'));
  const dataFile = path.join(tempDir, 'lms-data.json');
  await fs.copyFile(seedFile, dataFile);
  process.env.LMS_DATA_FILE = dataFile;

  delete require.cache[require.resolve('../server')];
  const { createServer } = require('../server');
  const server = createServer();

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    dataFile,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await fs.rm(tempDir, { recursive: true, force: true });
      delete process.env.LMS_DATA_FILE;
    }
  };
}

test('bootstrap endpoint returns LMS dashboard data', async (t) => {
  const app = await startTestServer();
  t.after(app.close);

  const response = await fetch(`${app.baseUrl}/api/bootstrap`);
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.summary.activeCourses, 3);
  assert.equal(payload.summary.learners, 2);
  assert.ok(payload.courses[0].instructor);
  assert.ok(payload.assignments[0].courseTitle);
});

test('course creation validates input and persists to the data store', async (t) => {
  const app = await startTestServer();
  t.after(app.close);

  const invalid = await fetch(`${app.baseUrl}/api/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Missing summary' })
  });
  assert.equal(invalid.status, 400);

  const created = await fetch(`${app.baseUrl}/api/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'AI for Educators',
      summary: 'Practical classroom AI workflows.',
      category: 'Teaching',
      level: 'Intermediate'
    })
  });
  assert.equal(created.status, 201);
  const course = await created.json();
  assert.equal(course.title, 'AI for Educators');

  const stored = JSON.parse(await fs.readFile(app.dataFile, 'utf8'));
  assert.ok(stored.courses.some((item) => item.title === 'AI for Educators'));
});

test('announcement creation adds a new announcement to the top of the feed', async (t) => {
  const app = await startTestServer();
  t.after(app.close);

  const response = await fetch(`${app.baseUrl}/api/announcements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Welcome', message: 'New cohort starts today.' })
  });

  assert.equal(response.status, 201);
  const announcement = await response.json();
  assert.equal(announcement.audience, 'All learners');

  const bootstrap = await fetch(`${app.baseUrl}/api/bootstrap`).then((item) => item.json());
  assert.equal(bootstrap.announcements[0].title, 'Welcome');
});

test('all LMS resource collections expose list endpoints', async (t) => {
  const app = await startTestServer();
  t.after(app.close);

  for (const collection of ['users', 'courses', 'assignments', 'quizzes', 'grades', 'announcements', 'discussions', 'calendar']) {
    const response = await fetch(`${app.baseUrl}/api/${collection}`);
    assert.equal(response.status, 200, collection);
    const payload = await response.json();
    assert.ok(Array.isArray(payload), collection);
  }
});

test('quiz, grade, discussion, calendar, and user creation persist records', async (t) => {
  const app = await startTestServer();
  t.after(app.close);

  const requests = [
    ['users', { name: 'Sam Rivera', role: 'student', email: 'sam.rivera@learnflow.test' }, 'name'],
    ['quizzes', { courseId: 101, title: 'Semantic HTML retake', questions: 6, published: true }, 'title'],
    ['grades', { studentId: 3, courseId: 103, score: 98 }, 'letter'],
    ['discussions', { courseId: 101, author: 'Sam Rivera', title: 'ARIA landmarks help' }, 'title'],
    ['calendar', { title: 'Capstone kickoff', date: '2026-06-10', time: '10:00' }, 'title']
  ];

  for (const [collection, body, expectedField] of requests) {
    const response = await fetch(`${app.baseUrl}/api/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 201, collection);
    const payload = await response.json();
    assert.ok(payload.id, collection);
    assert.ok(payload[expectedField], collection);
  }

  const stored = JSON.parse(await fs.readFile(app.dataFile, 'utf8'));
  assert.ok(stored.users.some((item) => item.name === 'Sam Rivera'));
  assert.ok(stored.quizzes.some((item) => item.title === 'Semantic HTML retake'));
  assert.ok(stored.grades.some((item) => item.score === 98 && item.letter === 'A+'));
  assert.ok(stored.discussions.some((item) => item.title === 'ARIA landmarks help'));
  assert.ok(stored.calendar.some((item) => item.title === 'Capstone kickoff'));
});

test('records can be retrieved, updated, and deleted by id', async (t) => {
  const app = await startTestServer();
  t.after(app.close);

  const created = await fetch(`${app.baseUrl}/api/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: 101, title: 'Final reflection', dueDate: '2026-06-12' })
  }).then((response) => response.json());

  const detail = await fetch(`${app.baseUrl}/api/assignments/${created.id}`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).title, 'Final reflection');

  const updated = await fetch(`${app.baseUrl}/api/assignments/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'closed', submissions: 24 })
  });
  assert.equal(updated.status, 200);
  const updatedPayload = await updated.json();
  assert.equal(updatedPayload.status, 'closed');
  assert.equal(updatedPayload.submissions, 24);
  assert.equal(updatedPayload.title, 'Final reflection');

  const removed = await fetch(`${app.baseUrl}/api/assignments/${created.id}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);

  const missing = await fetch(`${app.baseUrl}/api/assignments/${created.id}`);
  assert.equal(missing.status, 404);
});
