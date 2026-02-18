This project implements a web-based eligibility calculator for estimating residence time requirements related to:

Finnish citizenship

Permanent residence permit

The system models publicly available Finnish immigration regulations and translates them into structured backend logic.

Project Goals

Implement rule-based eligibility calculations

Model residence permit types (A/B)

Handle absence limits

Validate calculations using automated tests

Ensure maintainability and extensibility

Tech Stack

Go (backend)

REST API

Automated unit tests

Linux-based environment

GitHub for version control

Project Structure

internal/citizenship – citizenship logic

internal/residence – PR logic

internal/model – shared data models

api – HTTP handlers

docs – architecture and regulatory documentation
