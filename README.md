# LearnFlow LMS

LearnFlow is a polished full-stack Learning Management System demo built with a Node.js backend, JSON persistence, and a responsive vanilla HTML/CSS/JavaScript frontend.

## Features

- Responsive dashboard with LMS analytics for learners, instructors, courses, assignments, events, and discussions.
- Course catalog with progress, ratings, lessons, filtering, and a frontend course creation form.
- Assignment, quiz, gradebook, discussion, calendar, announcement, media library, enrollment, certificate, support, and admin-style management views.
- JSON-backed API for bootstrapping app data and creating courses, assignments, announcements, video/document resources, and certificates.
- Automated Node test suite covering key backend API workflows.

## Run locally

```bash
npm start
```

Then open <http://localhost:3000>.

## Test

```bash
npm test
```

## API overview

- `GET /api/health` — health check.
- `GET /api/bootstrap` — complete frontend data payload.
- `GET /api/courses` — list courses.
- `GET /api/courses/:id` — retrieve one course.
- `POST /api/courses` — create a course.
- `POST /api/assignments` — create an assignment.
- `POST /api/announcements` — create an announcement.
- `POST /api/resources` — create a video or document resource.
- `POST /api/certificates` — issue a certificate.
