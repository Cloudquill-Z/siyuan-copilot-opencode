# Second Full Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the confirmed reliability gaps found by the second full-code review and publish the resulting commits.

**Architecture:** Keep fixes at module boundaries: pure parsing tests for export/settings/memory, generation-based cancellation for health polling, throwing file APIs for persistence, and active-workspace selection in build tooling.

**Tech Stack:** Svelte 4, TypeScript, SiYuan kernel API, Node scripts, Vite.

---

1. Add failing regressions for all confirmed issues and run them in the red state.
2. Correct export platform resolution, zero-value normalization and strict memory decisions.
3. Add stale health-poll cancellation and verify old responses cannot update state.
4. Make file writes throw, preserve unsaved state on failure and validate callers.
5. Detect the active SiYuan workspace for noninteractive installation.
6. Upgrade Readability and set both manifests to 3.1.1.
7. Run all tests, typecheck, production build/install, graph update, commit and push main.
