const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = process.env.LMS_DATA_FILE || path.join(ROOT, 'data', 'lms-data.json');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

async function readStore() {
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeStore(store) {
  await fs.writeFile(DATA_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new Error('Request body must be valid JSON.');
  }
}

function nextId(items) {
  return Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;
}

function withCourseNames(store, collection) {
  return collection.map((item) => ({
    ...item,
    courseTitle: store.courses.find((course) => course.id === item.courseId)?.title || 'General'
  }));
}

function buildSummary(store) {
  const learners = store.users.filter((user) => user.role === 'student').length;
  const instructors = store.users.filter((user) => user.role === 'instructor').length;
  const averageProgress = Math.round(
    store.courses.reduce((total, course) => total + course.progress, 0) / store.courses.length
  );
  const averageGrade = Math.round(
    store.grades.reduce((total, grade) => total + grade.score, 0) / store.grades.length
  );

  return {
    learners,
    instructors,
    activeCourses: store.courses.length,
    openAssignments: store.assignments.filter((assignment) => assignment.status === 'open').length,
    averageProgress,
    averageGrade,
    upcomingEvents: store.calendar.length,
    discussionPosts: store.discussions.reduce((total, item) => total + item.replies, 0)
  };
}

async function handleApi(req, res, url) {
  const store = await readStore();
  const route = url.pathname;

  if (req.method === 'GET' && route === '/api/health') {
    return sendJson(res, 200, { status: 'ok', app: 'LearnFlow LMS' });
  }

  if (req.method === 'GET' && route === '/api/bootstrap') {
    return sendJson(res, 200, {
      summary: buildSummary(store),
      users: store.users,
      courses: store.courses.map((course) => ({
        ...course,
        instructor: store.users.find((user) => user.id === course.instructorId)?.name || 'Unassigned'
      })),
      assignments: withCourseNames(store, store.assignments),
      quizzes: withCourseNames(store, store.quizzes),
      grades: withCourseNames(store, store.grades).map((grade) => ({
        ...grade,
        student: store.users.find((user) => user.id === grade.studentId)?.name || 'Unknown learner'
      })),
      announcements: store.announcements,
      discussions: withCourseNames(store, store.discussions),
      calendar: store.calendar
    });
  }

  if (req.method === 'GET' && route === '/api/courses') {
    return sendJson(res, 200, store.courses);
  }

  if (req.method === 'GET' && route.startsWith('/api/courses/')) {
    const id = Number(route.split('/').pop());
    const course = store.courses.find((item) => item.id === id);
    return course ? sendJson(res, 200, course) : notFound(res);
  }

  if (req.method === 'POST' && route === '/api/courses') {
    const body = await parseBody(req);
    if (!body.title || !body.summary) return badRequest(res, 'Course title and summary are required.');
    const course = {
      id: nextId(store.courses),
      title: body.title,
      category: body.category || 'General',
      level: body.level || 'Beginner',
      instructorId: Number(body.instructorId) || 2,
      summary: body.summary,
      hero: body.hero || 'linear-gradient(135deg, #6944ff, #00b8d9)',
      progress: 0,
      rating: 0,
      lessons: []
    };
    store.courses.push(course);
    await writeStore(store);
    return sendJson(res, 201, course);
  }

  if (req.method === 'POST' && route === '/api/assignments') {
    const body = await parseBody(req);
    if (!body.courseId || !body.title || !body.dueDate) {
      return badRequest(res, 'Assignment courseId, title, and dueDate are required.');
    }
    const assignment = {
      id: nextId(store.assignments),
      courseId: Number(body.courseId),
      title: body.title,
      dueDate: body.dueDate,
      points: Number(body.points) || 100,
      status: body.status || 'open',
      submissions: 0
    };
    store.assignments.push(assignment);
    await writeStore(store);
    return sendJson(res, 201, assignment);
  }

  if (req.method === 'POST' && route === '/api/announcements') {
    const body = await parseBody(req);
    if (!body.title || !body.message) return badRequest(res, 'Announcement title and message are required.');
    const announcement = {
      id: nextId(store.announcements),
      title: body.title,
      message: body.message,
      audience: body.audience || 'All learners',
      date: body.date || new Date().toISOString().slice(0, 10)
    };
    store.announcements.unshift(announcement);
    await writeStore(store);
    return sendJson(res, 201, announcement);
  }

  return notFound(res);
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const normalized = path.normalize(decodeURIComponent(requestedPath)).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=60'
    });
    res.end(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const fallback = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': contentTypes['.html'] });
      res.end(fallback);
      return;
    }
    throw error;
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
      } else {
        await serveStatic(req, res, url);
      }
    } catch (error) {
      const statusCode = error.message.includes('JSON') ? 400 : 500;
      sendJson(res, statusCode, { error: error.message });
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`LearnFlow LMS running at http://localhost:${PORT}`);
  });
}

module.exports = { createServer, buildSummary, readStore };
