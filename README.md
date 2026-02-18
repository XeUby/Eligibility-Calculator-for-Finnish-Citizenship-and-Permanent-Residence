# Finnish Eligibility Calculator

## Overview

This project implements a web-based eligibility calculator for estimating residence time requirements related to:

- Finnish citizenship  
- Permanent residence permit  

The system models publicly available Finnish immigration regulations and translates them into structured backend logic.  

The goal is to demonstrate how complex regulatory requirements can be formalised, implemented, and validated within a maintainable software architecture.

---

## Motivation

Residence time calculations for Finnish citizenship and permanent residence can be difficult to interpret in practice. Different residence permit types (A and B permits), absence limits, and time-weighting rules create uncertainty for applicants.

This project approaches the problem from a software engineering perspective:  
How can regulatory rules be converted into a clear, testable, and extensible backend system?

---

## Project Goals

- Implement rule-based eligibility calculations  
- Model residence permit types (A/B)  
- Handle absence limits and edge cases  
- Validate calculations using automated tests  
- Ensure maintainability and extensibility of the system  

---

## System Design Principles

- Clear separation of concerns  
- Rule-based logic encapsulation  
- Deterministic calculations  
- Test-driven validation  
- Documentation of assumptions and limitations  

---

## Tech Stack

- **Go** – backend implementation  
- **REST API** – exposing calculation functionality  
- **Automated unit tests** – validation of business logic  
- **Linux-based environment** – development and testing  
- **GitHub** – version control and documentation  

---

## Project Structure

internal/
citizenship/ → Citizenship eligibility logic
residence/ → Permanent residence logic
model/ → Shared domain models
api/ → HTTP handlers
docs/ → Architecture and regulatory documentation

---

## Documentation

The `docs/` directory contains:

- Architecture description  
- Explanation of rule modelling decisions  
- References to publicly available regulatory sources  
- Known assumptions and limitations  

---

## Disclaimer

This tool is intended for informational purposes only.  
It does not provide legal advice and does not replace official guidance from Finnish authorities.

---

## Status

Active development.
