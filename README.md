# LearnFlow LMS

LearnFlow is a polished full-stack Learning Management System demo built with a Node.js backend, JSON persistence, and a responsive vanilla HTML/CSS/JavaScript frontend.

## Features

- Responsive dashboard with LMS analytics for learners, instructors, courses, assignments, events, and discussions.
- Course catalog with progress, ratings, lessons, filtering, and a frontend course creation form.
- Assignment, quiz, gradebook, discussion, calendar, announcement, and admin-style management views.
- JSON-backed API for bootstrapping app data and full CRUD workflows across users, courses, assignments, quizzes, grades, announcements, discussions, and calendar events.
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
- `GET /api/:collection` — list a collection (`users`, `courses`, `assignments`, `quizzes`, `grades`, `announcements`, `discussions`, or `calendar`).
- `GET /api/:collection/:id` — retrieve one record by id.
- `POST /api/:collection` — create a record with collection-specific validation and defaults.
- `PUT /api/:collection/:id` — replace a record after validating required fields.
- `PATCH /api/:collection/:id` — update selected record fields.
- `DELETE /api/:collection/:id` — remove a record from the JSON data store.
