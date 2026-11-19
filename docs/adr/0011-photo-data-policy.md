# 11. What photos may be sent to which provider

Date: 2026-11-19
Status: Proposed

## Context

Google's free tier may use inputs to improve its products, and human reviewers may read them. Experiments so far have sent public retailer product photos, some showing models. Users will send photos taken in their homes, which can include faces, rooms and personal details.

## Decision

- **Free tiers** (Gemini AI Studio free tier, free Workers AI Neurons) may receive only: public retailer product images, and photos of the owner's garments with no people, faces or personal details. This covers all experiments and benchmarks (B1–B11).
- **Real users' photos** go only to paid tiers whose terms exclude training on inputs. This must be in place before any public launch.
- The capture guide in the app asks for garment-only shots, and `garment_present` plus the shot type flag images that show mostly a person or a room.
- API keys stay on the server. The iOS client never holds a provider key.

## Consequences

- Experiments stay free.
- Launch depends on a paid key and checking each provider's data terms.
- Benchmark photos have to be taken with care: garment only, plain background.

## Alternatives considered

- **Run Clef's open weights ourselves.** No third party sees the photos at all. Worth revisiting if a provider's terms are unacceptable, but it needs GPU hosting.
