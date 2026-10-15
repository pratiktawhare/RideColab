# RideColab — API Documentation

> Auto-generated documentation is available at `http://localhost:4000/api/v1/docs` (Swagger UI) when the server is running.
> This file contains supplementary notes.

## Base URL
- **Local**: `http://localhost:4000/api/v1`
- **Production**: `https://<render-app>.onrender.com/api/v1`

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

Access tokens expire in **15 minutes**. Use `POST /auth/refresh` with your refresh token to obtain a new one.

## Response Format
All responses follow this shape:
```json
// Success
{ "success": true, "data": { ... }, "meta": { "page": 1, "total": 42 } }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human-readable message", "details": null } }
```

## Endpoints (added per phase)

*Endpoints are documented via @swagger JSDoc comments in the route files and appear in Swagger UI.*

---
*This file will be updated as phases progress.*
