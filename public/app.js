const state = {
  data: null,
  courseQuery: ''
};

const formatDate = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const selectors = {
  statsGrid: document.querySelector('#statsGrid'),
  courseGrid: document.querySelector('#courseGrid'),
  courseSearch: document.querySelector('#courseSearch'),
  assignmentList: document.querySelector('#assignmentList'),
  quizList: document.querySelector('#quizList'),
  gradeRows: document.querySelector('#gradeRows'),
  discussionList: document.querySelector('#discussionList'),
  calendarList: document.querySelector('#calendarList'),
  resourceList: document.querySelector('#resourceList'),
  enrollmentRows: document.querySelector('#enrollmentRows'),
  certificateList: document.querySelector('#certificateList'),
  supportList: document.querySelector('#supportList'),
  announcementList: document.querySelector('#announcementList'),
  courseForm: document.querySelector('#courseForm'),
  courseStatus: document.querySelector('#courseStatus'),
  announcementForm: document.querySelector('#announcementForm'),
  announcementStatus: document.querySelector('#announcementStatus'),
  courseTemplate: document.querySelector('#courseCardTemplate')
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Something went wrong.');
  return payload;
}

function statCards(summary) {
  const cards = [
    ['Active learners', summary.learners],
    ['Active courses', summary.activeCourses],
    ['Average progress', `${summary.averageProgress}%`],
    ['Average grade', `${summary.averageGrade}%`],
    ['Open assignments', summary.openAssignments],
    ['Upcoming events', summary.upcomingEvents],
    ['Video assets', summary.videoAssets],
    ['Documents', summary.documentAssets],
    ['Certificates', summary.certificatesIssued],
    ['Enrollments', summary.activeEnrollments],
    ['Support tickets', summary.openSupportTickets],
    ['Instructor team', summary.instructors],
    ['Forum replies', summary.discussionPosts]
  ];

  selectors.statsGrid.innerHTML = cards
    .map(([label, value]) => `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join('');
}

function renderCourses() {
  const query = state.courseQuery.trim().toLowerCase();
  const courses = state.data.courses.filter((course) => {
    return [course.title, course.category, course.level, course.instructor]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  selectors.courseGrid.innerHTML = '';
  courses.forEach((course) => {
    const card = selectors.courseTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector('.course-card__hero').style.background = course.hero;
    card.querySelector('.course-card__meta').textContent = `${course.category} • ${course.level}`;
    card.querySelector('h3').textContent = course.title;
    card.querySelector('p').textContent = course.summary;
    card.querySelector('.progress span').style.setProperty('--progress', `${course.progress}%`);
    card.querySelector('.course-card__footer').innerHTML = `
      <span class="badge">${course.progress}% complete</span>
      <span class="badge">★ ${course.rating}</span>
      <span class="badge">${course.lessons.length} lessons</span>
    `;
    selectors.courseGrid.append(card);
  });
}

function renderList(target, items, template) {
  target.innerHTML = items.map(template).join('');
}

function renderAssignments(assignments) {
  renderList(selectors.assignmentList, assignments, (assignment) => `
    <article class="list-item">
      <div class="list-item__top">
        <strong>${assignment.title}</strong>
        <span class="badge">${assignment.status}</span>
      </div>
      <span class="meta-line">${assignment.courseTitle} • Due ${formatDate.format(new Date(assignment.dueDate))}</span>
      <p>${assignment.points} points • ${assignment.submissions} submissions received</p>
    </article>
  `);
}

function renderQuizzes(quizzes) {
  renderList(selectors.quizList, quizzes, (quiz) => `
    <article class="list-item">
      <div class="list-item__top">
        <strong>${quiz.title}</strong>
        <span class="badge">${quiz.published ? 'Published' : 'Draft'}</span>
      </div>
      <span class="meta-line">${quiz.courseTitle} • ${quiz.questions} questions • ${quiz.timeLimit}</span>
      <p>Average score: ${quiz.averageScore}%</p>
    </article>
  `);
}

function renderGrades(grades) {
  selectors.gradeRows.innerHTML = grades
    .map((grade) => `
      <tr>
        <td>${grade.student}</td>
        <td>${grade.courseTitle}</td>
        <td><span class="score">${grade.score}% (${grade.letter})</span></td>
        <td>${grade.trend}</td>
      </tr>
    `)
    .join('');
}

function renderDiscussions(discussions) {
  renderList(selectors.discussionList, discussions, (discussion) => `
    <article class="list-item">
      <strong>${discussion.title}</strong>
      <span class="meta-line">${discussion.courseTitle} • Started by ${discussion.author}</span>
      <p>${discussion.replies} replies • Last activity ${formatDate.format(new Date(discussion.lastActivity))}</p>
    </article>
  `);
}

function renderCalendar(events) {
  selectors.calendarList.innerHTML = events
    .map((event) => `
      <article class="timeline-item">
        <strong>${event.title}</strong>
        <span class="meta-line">${formatDate.format(new Date(event.date))} at ${event.time}</span>
        <span class="badge">${event.type}</span>
      </article>
    `)
    .join('');
}


function renderResources(resources) {
  renderList(selectors.resourceList, resources, (resource) => `
    <article class="list-item resource-item">
      <div class="list-item__top">
        <strong>${resource.title}</strong>
        <span class="badge">${resource.type}</span>
      </div>
      <span class="meta-line">${resource.courseTitle} • ${resource.status} • ${resource.access} access</span>
      <p>${resource.type === 'video' ? `Runtime ${resource.duration}` : `File size ${resource.size}`} • Updated ${formatDate.format(new Date(resource.updatedAt))}</p>
      <a class="resource-link" href="${resource.url}" aria-label="Open ${resource.title}">Open resource</a>
    </article>
  `);
}

function renderEnrollments(enrollments) {
  selectors.enrollmentRows.innerHTML = enrollments
    .map((enrollment) => `
      <tr>
        <td>${enrollment.student}</td>
        <td>${enrollment.courseTitle}</td>
        <td><span class="score">${enrollment.progress}%</span></td>
        <td>${enrollment.attendance}</td>
        <td><span class="badge">${enrollment.status}</span></td>
      </tr>
    `)
    .join('');
}

function renderCertificates(certificates) {
  renderList(selectors.certificateList, certificates, (certificate) => `
    <article class="list-item">
      <div class="list-item__top">
        <strong>${certificate.title}</strong>
        <span class="badge">${certificate.status}</span>
      </div>
      <span class="meta-line">${certificate.student} • ${certificate.courseTitle}</span>
      <p>Credential ${certificate.credentialId} • Issued ${formatDate.format(new Date(certificate.issuedDate))}</p>
    </article>
  `);
}

function renderSupportTickets(tickets) {
  renderList(selectors.supportList, tickets, (ticket) => `
    <article class="list-item">
      <div class="list-item__top">
        <strong>${ticket.title}</strong>
        <span class="badge">${ticket.priority}</span>
      </div>
      <span class="meta-line">${ticket.requester} • ${ticket.owner}</span>
      <p>${ticket.status} • Updated ${formatDate.format(new Date(ticket.updatedAt))}</p>
    </article>
  `);
}

function renderAnnouncements(announcements) {
  renderList(selectors.announcementList, announcements, (announcement) => `
    <article class="list-item">
      <div class="list-item__top">
        <strong>${announcement.title}</strong>
        <span class="badge">${announcement.audience}</span>
      </div>
      <p>${announcement.message}</p>
      <span class="meta-line">${formatDate.format(new Date(announcement.date))}</span>
    </article>
  `);
}

function render() {
  statCards(state.data.summary);
  renderCourses();
  renderAssignments(state.data.assignments);
  renderQuizzes(state.data.quizzes);
  renderGrades(state.data.grades);
  renderDiscussions(state.data.discussions);
  renderCalendar(state.data.calendar);
  renderResources(state.data.resources);
  renderEnrollments(state.data.enrollments);
  renderCertificates(state.data.certificates);
  renderSupportTickets(state.data.supportTickets);
  renderAnnouncements(state.data.announcements);
}

async function refresh() {
  state.data = await api('/api/bootstrap');
  render();
}

selectors.courseSearch.addEventListener('input', (event) => {
  state.courseQuery = event.target.value;
  renderCourses();
});

selectors.courseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const course = Object.fromEntries(formData.entries());
  selectors.courseStatus.textContent = 'Publishing...';
  try {
    await api('/api/courses', { method: 'POST', body: JSON.stringify(course) });
    event.currentTarget.reset();
    selectors.courseStatus.textContent = 'Course published successfully.';
    await refresh();
  } catch (error) {
    selectors.courseStatus.textContent = error.message;
  }
});

selectors.announcementForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const announcement = Object.fromEntries(formData.entries());
  selectors.announcementStatus.textContent = 'Sending...';
  try {
    await api('/api/announcements', { method: 'POST', body: JSON.stringify(announcement) });
    event.currentTarget.reset();
    selectors.announcementStatus.textContent = 'Announcement sent.';
    await refresh();
  } catch (error) {
    selectors.announcementStatus.textContent = error.message;
  }
});

refresh().catch((error) => {
  document.body.innerHTML = `<main class="main-content"><section class="panel"><h1>Unable to load LMS</h1><p>${error.message}</p></section></main>`;
});
