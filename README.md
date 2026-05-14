# Hage Logistics Backend (MVP)

Hage Logistics provides smart cargo logistics solutions that connect **Enterprises**, **Transporters**, and **Businesses**.  
This backend MVP powers the core API infrastructure for shipment tracking, user management, and transport operations.

## Tech Stack

- [NestJS](https://nestjs.com/) — scalable Node.js framework
- [Prisma](https://www.prisma.io/) — type-safe database ORM
- [Swagger](https://swagger.io/) — API documentation
- [PostgreSQL](https://www.postgresql.org/) — primary database
- [Jest](https://jestjs.io/) & [Supertest](https://github.com/ladjs/supertest) — testing

## Project Structure

```bash
HageMVP-Backend/
├─ .github/
│ └─ workflows/
├─ prisma/
│ ├─ schema.prisma # Prisma schema
│ └─ seed.ts # Initial data seeding
├─ src/
│ ├─ app.module.ts
│ ├─ main.ts
│ ├─ config/
│ ├─ common/
│ │ ├─ decorators/
│ │ ├─ guards/
│ │ └─ pipes/
│ ├─ modules/
│ │ ├─ auth/
│ │ ├─ warehouses/
│ │ ├─ shipments/
│ │ └─ inventory/
│ ├─ prisma/
│ │ └─ prisma.service.ts
│ ├─ shared/
│ └─ utils/
│ └─ logger.ts
├─ test/
│ └─ app.e2e-spec.ts
├─ .env.example
├─ .gitignore
├─ CONTRIBUTING.md
├─ README.md
└─ tsconfig.json
```

## ⚙️ Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/<your-org>/HageMVP-Backend.git
cd HageMVP-Backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment

Copy the example **environment file**:

```bash
cp .env.example .env
Update your .env with database credentials and JWT secrets.
```

#### Environment variables (required)

These are the main runtime variables used by the API (locally and in App Runner):

- **Core**: `NODE_ENV`, `PORT`
- **Database**: `DATABASE_URL`
- **Auth**: `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_EXPIRES_DAYS`
- **URLs/branding**: `APP_NAME`, `APP_URL`, `FRONTEND_URL`, `API_PREFIX`, `APP_LOGO`
- **Email** (Mailtrap SMTP via `MailService` / nodemailer): `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`
- **Storage**: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **App Runner startup controls**: `ENABLE_SEEDING`, `FORCE`

#### GitHub Actions / App Runner deployment variables

The deploy workflow uses GitHub Actions secrets/variables:

- **Secrets**: `AWS_ACCOUNT_ID`
- **Variables**: `AWS_REGION`, `APP_URL_DEV`, `APP_URL_PROD`, `FRONTEND_URL_DEV`, `FRONTEND_URL_PROD`, `ENABLE_PROD_SEEDING` (optional)

### 4. Setup Database

```bash
npx prisma migrate dev
npx prisma generate
npx ts-node prisma/seed.ts   # Optional: seed initial data
```

### 5. Run the Application

```bash
npm run start:dev
```

The API will be available at:
```bash
http://localhost:3000/api
```

Swagger API docs:
```bash
http://localhost:3000/api/docs
```

## 🧪 Running Tests

```bash
npm run test
npm run test:e2e
```

## API Documentation

- All endpoints are documented using Swagger.
- Visit /api/docs to view interactive API documentation.
- Authentication uses Bearer tokens.

## Available Scripts

| Script                  | Description                         |
| ----------------------- | ----------------------------------- |
| `npm run start`         | Start production server             |
| `npm run start:dev`     | Start development server with watch |
| `npm run build`         | Build the project                   |
| `npm run test`          | Run unit tests                      |
| `npm run test:e2e`      | Run end-to-end tests                |
| `npm run prisma:studio` | Open Prisma Studio                  |
