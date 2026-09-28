# World Challenge 🌍✈️🎮

World Challenge is a modern mobile-first social multiplayer game where players meet opponents from around the world and compete in cultural mini-games together.

## Concept: PLAY + MEET PEOPLE + DISCOVER THE WORLD
- 🤝 **Meet people globally**: Match with players from over 25+ rich country datasets (Tunisia 🇹🇳, Japan 🇯🇵, France 🇫🇷, Brazil 🇧🇷, South Korea 🇰🇷, Egypt 🇪🇬, and more).
- 🎮 **7 Unique Cultural Mini-Games**:
  1. **Country Quiz**: Guess flags, capitals, monuments, and unusual facts.
  2. **Guess the Word**: Authentic expressions (e.g. *Barsha* in Tunisian Arabic, *Saudade* in Portuguese, *Komorebi* in Japanese, *Cwtch* in Welsh).
  3. **Mystery Food**: Iconic recipes (Couscous, Ramen, Feijoada, Tacos al Pastor, Paella, etc.).
  4. **Music & Instruments**: Cultural instruments (Oud, Sitar, Steelpan, Taiko, Mariachi) with Web Audio sound synthesis.
  5. **World Map**: Interactive geographic pinpointing.
  6. **Cultural Mime & Traditions**: Festivals, dances, and rituals (Haka, Hanami, La Tomatina, Día de los Muertos, Holi).
  7. **1 vs 1 Speed Duel**: Buzzer battle where fast correct answers score bonus points.
- 🛂 **Virtual Passport Progression**: Every time you complete a match with a player from a new country, that country is stamped into your passport booklet.
- 🏆 **Progression & Social**:
  - Level system & XP progression bar.
  - Global, Weekly, and By-Country Leaderboards.
  - Achievement Badges (*First Journey*, *World Traveler*, *Global Explorer*, *Champion*, *Speed Demon*, etc.).
  - Daily Cultural Challenge with streak tracking and coin rewards.
  - Real-time in-game chat with emoji reactions.
  - Safety moderation: Player reporting, mute controls, profanity filter.
  - Role-based Admin Dashboard for questions, country catalogs, and moderation reports.

## Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Canvas Confetti.
- **Backend / Database**: Google Cloud Firestore with real-time listeners and transactions.
- **Authentication**: Firebase Authentication (Google popup, Email/Password, and Instant Guest Play with country picker).
- **Security**: Hardened Zero-Trust Firestore Security Rules (`firestore.rules`) with path guards, PII isolation, and role authorization.
- **Audio**: Web Audio API sound generator (chimes, pops, buzzer, countdown, stamp thud, victory fanfares).

## Setup & Running
1. `npm install`
2. `npm run dev` (starts on port 3000)
3. Build for production: `npm run build`
