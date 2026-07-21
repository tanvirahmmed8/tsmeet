# TSMeet Features

TSMeet is a comprehensive, open-source video meeting, scheduling, and API platform built with Next.js, Node.js, and WebRTC. Below is a detailed breakdown of the features available in the application.

## 📹 Core Video Conferencing

- **1-to-1 & Small Group Video Calls**: WebRTC peer-to-peer mesh rooms are capped by `MAX_MESH_PARTICIPANTS` (8 by default). Larger meetings require an SFU.
- **HD Audio & Video**: Supports high-definition video up to 1080p with adaptive bitrate streaming to accommodate varying network conditions.
- **Screen Sharing**: Share your entire screen, specific windows, or browser tabs with zero latency and perfect clarity.
- **Virtual Backgrounds**: Leverages `@mediapipe/selfie_segmentation` to provide seamless virtual backgrounds and background blurring during calls.
- **In-Meeting Text Chat**: Real-time messaging alongside the video feed, powered by Socket.IO.
- **Media Controls**: Comprehensive participant controls, including camera toggle, microphone mute/unmute, and host moderation tools.

## 📅 Scheduling & Calendars

- **Calendar Management**: Users can create and manage multiple calendars for different meeting types or availability schedules.
- **Public Booking Pages**: Shareable public URLs (e.g., `/calendars/[slug]`) where external guests can view available time slots and book meetings directly.
- **Slot Management & Holidays**: Set specific availability blocks, block out holidays, and manage disabled slots to prevent double-booking.
- **Booking Workflows**: Automated handling of booking confirmations, cancellations, and meeting link generation upon booking.

## 👥 User Management & Dashboard

- **Secure Authentication**: Built-in user registration and login using JWT (JSON Web Tokens) and bcrypt password hashing.
- **Meeting Dashboard**: A centralized portal for users to view upcoming bookings, past meeting history, and manage their calendar links.
- **Guest Access**: External participants can join meetings instantly via a shareable link without needing to create an account.

## 🔴 Recording & Archival

- **Server-Managed Recording**: A dedicated recorder worker handles meeting session archival without taxing the client's browser.
- **Recording Dashboard**: Users can view, replay, and manage their saved recordings directly from the `dashboard/recordings` interface.
- **REST APIs for Recordings**: Dedicated API endpoints to fetch, retrieve, and filter historical recordings.

## 🔌 Developer API & Integration

- **RESTful API**: Comprehensive backend endpoints for managing rooms, calendars, bookings, and users.
- **Real-time WebSocket API**: Socket.IO contracts for WebRTC signaling, room joining, ICE candidate exchange, and chat messaging.
- **Interactive API Docs**: Built-in API documentation available at `/dashboard/api-docs` for developers looking to integrate TSMeet into existing workflows.

## 🔒 Security & Infrastructure

- **End-to-End Encryption Ready**: Utilizes WebRTC's mandatory DTLS-SRTP for encrypted media streams in transit.
- **Self-Hosted Infrastructure**: Total data ownership. No reliance on third-party cloud communication APIs (like Twilio or Daily.co). Includes documentation for self-hosting Coturn STUN/TURN servers.
- **Secure Database Operations**: Uses MySQL with parameterized queries and prepared statements to prevent SQL injection.
- **Stateless Sessions**: Employs stateless JWT tokens for API protection and handshake validation during WebSocket connections.
