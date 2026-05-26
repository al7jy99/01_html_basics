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

const collectionConfigs = {
  users: {
    required: ['name', 'role', 'email'],
    label: 'User',
    defaults: (body) => ({
      avatar: body.avatar || initials(body.name),
      status: body.status || 'active'
    })
  },
  courses: {
    required: ['title', 'summary'],
    label: 'Course',
    validationMessage: 'Course title and summary are required.',
    defaults: (body) => ({
      category: body.category || 'General',
      level: body.level || 'Beginner',
      instructorId: Number(body.instructorId) || 2,
      hero: body.hero || 'linear-gradient(135deg, #6944ff, #00b8d9)',
      progress: Number(body.progress) || 0,
      rating: Number(body.rating) || 0,
      lessons: Array.isArray(body.lessons) ? body.lessons : []
    })
  },
  assignments: {
    required: ['courseId', 'title', 'dueDate'],
    label: 'Assignment',
    validationMessage: 'Assignment courseId, title, and dueDate are required.',
    defaults: (body) => ({
      courseId: Number(body.courseId),
      points: Number(body.points) || 100,
      status: body.status || 'open',
      submissions: Number(body.submissions) || 0
    })
  },
  quizzes: {
    required: ['courseId', 'title'],
    label: 'Quiz',
    defaults: (body) => ({
      courseId: Number(body.courseId),
      questions: Number(body.questions) || 0,
      timeLimit: body.timeLimit || '15 min',
      averageScore: Number(body.averageScore) || 0,
      published: parseBoolean(body.published)
    })
  },
  grades: {
    required: ['studentId', 'courseId', 'score'],
    label: 'Grade',
    defaults: (body) => {
      const score = Number(body.score);
      return {
        studentId: Number(body.studentId),
        courseId: Number(body.courseId),
        score,
        letter: body.letter || letterGrade(score),
        trend: body.trend || '0%'
      };
    }
  },
  announcements: {
    required: ['title', 'message'],
    label: 'Announcement',
    validationMessage: 'Announcement title and message are required.',
    defaults: (body) => ({
      audience: body.audience || 'All learners',
      date: body.date || new Date().toISOString().slice(0, 10)
    }),
    insert: 'unshift'
  },
  discussions: {
    required: ['courseId', 'author', 'title'],
    label: 'Discussion',
    defaults: (body) => ({
      courseId: Number(body.courseId),
      replies: Number(body.replies) || 0,
      lastActivity: body.lastActivity || new Date().toISOString().slice(0, 10)
    })
  },
  calendar: {
    required: ['title', 'date'],
    label: 'Calendar event',
    defaults: (body) => ({
      type: body.type || 'event',
      time: body.time || '09:00'
    })
  }
};

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
}

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'U';
}

function letterGrade(score) {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

function validateRequired(body, config) {
  const missing = config.required.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
  if (missing.length) {
    return config.validationMessage || `${config.label} ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.`;
  }
  return null;
}

function buildRecord(collection, body, existing = {}) {
  const config = collectionConfigs[collection];
  const merged = { ...existing, ...body };
  return {
    ...merged,
    ...config.defaults(merged, existing)
  };
}

function itemId(item) {
  return Number(item.id);
}

async function handleCollectionApi(req, res, store, route) {
  const [, , collection, idSegment] = route.split('/');
  const config = collectionConfigs[collection];
  if (!config) return false;

  const items = store[collection];
  if (!Array.isArray(items)) return false;

  if (req.method === 'GET' && !idSegment) {
    return sendJson(res, 200, items);
  }

  if (req.method === 'GET' && idSegment) {
    const id = Number(idSegment);
    const item = items.find((entry) => itemId(entry) === id);
    return item ? sendJson(res, 200, item) : notFound(res);
  }

  if (req.method === 'POST' && !idSegment) {
    const body = await parseBody(req);
    const validationError = validateRequired(body, config);
    if (validationError) return badRequest(res, validationError);

    const record = { ...buildRecord(collection, body), id: nextId(items) };
    if (config.insert === 'unshift') items.unshift(record);
    else items.push(record);

    await writeStore(store);
    return sendJson(res, 201, record);
  }

  if ((req.method === 'PUT' || req.method === 'PATCH') && idSegment) {
    const id = Number(idSegment);
    const index = items.findIndex((entry) => itemId(entry) === id);
    if (index === -1) return notFound(res);

    const body = await parseBody(req);
    if (req.method === 'PUT') {
      const validationError = validateRequired(body, config);
      if (validationError) return badRequest(res, validationError);
    }

    const existing = req.method === 'PUT' ? {} : items[index];
    items[index] = { ...buildRecord(collection, body, existing), id };
    await writeStore(store);
    return sendJson(res, 200, items[index]);
  }

  if (req.method === 'DELETE' && idSegment) {
    const id = Number(idSegment);
    const index = items.findIndex((entry) => itemId(entry) === id);
    if (index === -1) return notFound(res);

    const [removed] = items.splice(index, 1);
    await writeStore(store);
    return sendJson(res, 200, removed);
  }

  return false;
}

function buildSummary(store) {
  const learners = store.users.filter((user) => user.role === 'student').length;
  const instructors = store.users.filter((user) => user.role === 'instructor').length;
  const averageProgress = store.courses.length
    ? Math.round(store.courses.reduce((total, course) => total + course.progress, 0) / store.courses.length)
    : 0;
  const averageGrade = store.grades.length
    ? Math.round(store.grades.reduce((total, grade) => total + grade.score, 0) / store.grades.length)
    : 0;

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

  const handled = await handleCollectionApi(req, res, store, route);
  if (handled !== false) return handled;

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
