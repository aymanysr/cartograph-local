# Universal Framework: Cognitive & Neurodivergent Codebase Comprehension

**Document Type:** General Software Engineering & Cognitive Ergonomics Standard  
**Document Path:** `docs/superpowers/research/universal-neurodivergent-codebase-comprehension-framework.md`  
**Target Audience:** Tool Designers, Technical Educators, Team Leads, and Systems Architects  
**Scope:** Standalone. Applicable to any software repository, architecture visualization tool, onboarding pipeline, or IDE extension.  

---

## 1. Executive Summary

When students and engineers explore large unfamiliar software systems, they experience rapid cognitive saturation.
For neurodivergent individuals—including those with **Attention-Deficit/Hyperactivity Disorder (ADHD)**, **Autism Spectrum Conditions (ASC/ASD)**, **Dyslexia**, and **Working Memory Constraints**—unfamiliar codebases create severe cognitive barriers:
1. **Working memory overflow** caused by deep dependency chains.
2. **Context-switching penalties** caused by jumping between editor tabs, documentation windows, and terminal logs.
3. **Detail entrapment** caused by getting stuck in leaf-level syntax without understanding the system topology.
4. **Visual crowding and text fatigue** caused by dense unstructured files.
5. **Anxiety and distrust** caused by non-deterministic or hallucinated explanations.

This framework defines a portable, domain-independent standard for presenting large codebases.
It provides:
- Core cognitive science principles.
- Neurodivergent accessibility requirements.
- A universal **What Stays / What Leaves / What Reworks** decision matrix.
- An actionable audit checklist for any software project.

---

## 2. Core Cognitive Science Foundations

### 2.1 Cognitive Load Theory (Sweller, 1988, 2011)

Total mental effort in working memory consists of three additive parts:

```
Total Cognitive Load = Intrinsic Load + Germane Load + Extraneous Load
```

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOTAL WORKING MEMORY CAPACITY (Fixed: 4 ± 1 chunks)                    │
├────────────────────────┬───────────────────────┬───────────────────────┤
│ Intrinsic Load         │ Germane Load          │ Extraneous Load       │
│ (Inherent Code Logic & │ (Schema Construction  │ (Visual noise, split  │
│  Domain Algorithms)    │  & Mental Model Bldg) │  attention, UI chrome)│
└────────────────────────┴───────────────────────┴───────────────────────┘
                                                 ▲
                                                 │ MUST BE ELIMINATED!
```

1. **Intrinsic Load:** The natural complexity of the domain logic (e.g., database transactions, network protocols). It cannot be removed.
2. **Germane Load:** The productive effort of building long-term mental models (schemas) of the software.
3. **Extraneous Load:** Mental effort wasted on tool operation, split attention, visual noise, and confusing layouts. **Designers must eliminate this load.**

#### Critical Cognitive Effects:
- **Split-Attention Effect (Chandler & Sweller, 1992):** Do not force users to hold information from one panel while looking at another panel. Keep connected information physically close.
- **Redundancy Effect:** Do not repeat identical information in long narrative text if a clear diagram already shows it.
- **Element Interactivity:** When modules depend heavily on each other, novices cannot understand them in isolation. External visual maps must carry this burden.

---

### 2.2 Working Memory Limits & Cowan's K = 4 (Cowan, 2001)

- Human working memory holds only **4 ± 1 discrete items** simultaneously.
- Senior engineers hold 4 complex schemas (e.g., "Authentication Pipeline", "Database Pool").
- Novices hold 4 raw file names before their working memory overflows and resets:

```
Senior Architect Memory (Chunked Schemas):
[ Auth Layer ] ➔ [ Database Pool ]  (2 slots used)

Novice Student Memory (Un-chunked Raw Files):
[ File A ] ➔ [ File B ] ➔ [ Import C ] ➔ [ Function D ] ➔ OVERFLOW!
```

### 2.3 Information Foraging Theory (Ko et al., 2006; Pirolli & Card, 1999)

- Programmers spend up to **35% of their total engineering time** mechanically navigating between code locations.
- Weak naming cues or hidden dependencies increase the mental cost of finding information.
- Clear visual signals reduce foraging time.

### 2.4 Programmer Questioning Stages (Sillito et al., 2006, 2008)

Developers ask questions in four phases:
1. *Finding Focus Points:* "Where does this feature start? What is the entry point?"
2. *Expanding Focus Points:* "Who calls this? What does this import?"
3. *Understanding a Subgraph:* "How do these three files cooperate?"
4. *Understanding Groups of Subgraphs:* "How does the API layer connect to the database?"

**Rule:** Tools must answer Phase 1 and Phase 2 questions immediately, without requiring manual text searches.

---

## 3. Neurodivergent Accessibility Profiles & Scaffolding

```
┌─────────────────┬───────────────────────────────────┬───────────────────────────────────┐
│ Profile         │ Primary Cognitive Barrier         │ Required Engineering Scaffolding  │
├─────────────────┼───────────────────────────────────┼───────────────────────────────────┤
│ ADHD            │ Executive initiation failure,     │ First-class entry point badges,   │
│                 │ working memory wipe on tab-switch │ persistent causal breadcrumbs,    │
│                 │ (23-minute resumption delay)      │ quiet monochrome user interface   │
├─────────────────┼───────────────────────────────────┼───────────────────────────────────┤
│ Autism (ASD)    │ Local detail entrapment,          │ 100% deterministic dependencies,  │
│                 │ distress from heuristic guesses   │ explicit 4-part role taxonomy,    │
│                 │ and layout motion                 │ rigid collision-free positioning  │
├─────────────────┼───────────────────────────────────┼───────────────────────────────────┤
│ Dyslexia        │ Text-density fatigue, visual      │ Spatial diagrammatic primacy,     │
│                 │ crowding in long file paths       │ high-contrast monospace fonts,    │
│                 │ and source code blocks            │ macro zoom level-of-detail (LOD)  │
├─────────────────┼───────────────────────────────────┼───────────────────────────────────┤
│ Novice Learners │ Exceeding Cowan's 4-chunk limit   │ Single-column causal flow cards,  │
│ (General)       │ when tracing call cascades        │ plain-language metric labels      │
└─────────────────┴───────────────────────────────────┴───────────────────────────────────┘
```

### 3.1 Attention-Deficit / Hyperactivity Disorder (ADHD)

- **Barrier 1: Activation Paralysis.** When opening a repo with 100+ files, the learner does not know where execution starts.
  - *Scaffold:* Automatically label zero-incoming root files with a prominent green **`ENTRY`** tag.
- **Barrier 2: Context Wiping on Interruption.** Switching windows or tabs clears active working memory. Rebuilding context takes 23 minutes on average (Mark et al., 2008).
  - *Scaffold:* Keep persistent visual breadcrumbs visible: `[Imports] ➔ [Current File] ➔ [Callers] ➔ [Downstream]`.
- **Barrier 3: Distraction from Ambient UI Chrome.**
  - *Scaffold:* Use a quiet monochrome background (`#101014` or `#0f172a`). Eliminate flashing badges, decorative gradients, and auto-playing animations.

### 3.2 Autism Spectrum Conditions (ASC / ASD)

- **Barrier 1: Weak Central Coherence (Detail Entrapment).** The learner studies low-level syntax in a utility file without knowing its architectural purpose.
  - *Scaffold:* Assign every file an explicit architectural role before showing code:
    1. `Execution Entry Point` (in-degree = 0)
    2. `Foundational Leaf Module` (outbound imports = 0)
    3. `Internal Engine Module` (has both incoming and outgoing edges)
    4. `Circular Dependency` (part of a cycle loop)
- **Barrier 2: Intolerance of Heuristic or Hallucinated Data.** Speculative AI summaries or arbitrary "Quality Grades" create confusion and distrust.
  - *Scaffold:* Use 100% deterministic AST parsing. If an edge cannot be proven from real code lines, do not show it.
- **Barrier 3: Disorientation from Layout Motion.** Spring force graphs that drift or jiggle cause sensory fatigue.
  - *Scaffold:* Use stable, deterministic topological layouts with rigid Axis-Aligned Bounding Box (AABB) collision prevention. Cards must never overlap.

### 3.3 Dyslexia & Text Processing Strengths

- **Barrier 1: Text-Density Fatigue.** Scanning multi-segmented directory paths (`app/services/internal/auth/tokens/jwt.ts`) causes decoding strain.
  - *Scaffold:* Make the 2D spatial diagram the primary interface. Use spatial positions and directional arrows instead of long text lists.
- **Barrier 2: Visual Crowding.** Small, tightly packed fonts blur together.
  - *Scaffold:* Use clean monospace typography with distinct characters (`JetBrains Mono`, `Fira Code`).
  - *Scaffold:* Implement **Macro Zoom Level-of-Detail (LOD)**. When zoomed out, hide secondary metadata and show only large, bold file titles.

---

## 4. The Universal Decision Matrix: What Stays, What Leaves, What Reworks

Apply this matrix to any codebase documentation, onboarding interface, or developer tool:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       UNIVERSAL ARCHITECTURE BLUEPRINT                      │
├──────────────────────────────┬──────────────────────────────┬───────────────┤
│ WHAT STAYS (Keep & Enforce)  │ WHAT LEAVES (Prune & Hide)   │ WHAT REWORKS  │
├──────────────────────────────┼──────────────────────────────┼───────────────┤
│ • Deterministic AST graphs   │ • Deep multi-tab nesting     │ • Single-col  │
│ • Directional topologies     │ • Arbitrary letter grades    │   causal flow │
│ • AABB collision prevention  │ • Hallucinated summaries     │ • 4-part role │
│ • Hover flashlight edges     │ • Visual graph "hairballs"   │   taxonomy    │
│ • First-class entry points   │ • Monolithic code dumps      │ • Plain-text  │
│ • Directory cluster hulls    │ • Raw developer test chrome  │   metric names│
│ • Clickable file chips       │ • Ambient moving animations  │ • Keyboard ⌘K │
│ • Refactoring cycle guides   │ • Micro-text crowding        │   palette     │
└──────────────────────────────┴──────────────────────────────┴───────────────┘
```

### 4.1 What Stays (Mandatory Scaffolds)
1. **Deterministic Dependency Grounding:** Prove every relationship from source code imports.
2. **Directional Flow Alignment:** Align graphs with human reading direction (Pipeline: Left-to-Right; Hierarchy: Top-to-Bottom).
3. **Collision-Free Geometry:** Cards and text blocks must never overlap.
4. **Interactive Hover Wayfinding:** Hovering over a module highlights its direct callers in rose/red and dependencies in cyan/blue, while dimming unrelated modules.
5. **Clear Entry Points:** Label root starting files immediately.
6. **Clickable Tokens:** Every mentioned file path must be an interactive link that focuses the target file.
7. **Refactoring Recipes for Circular Dependencies:** Do not just warn about cycles. Provide step-by-step decoupling instructions.

### 4.2 What Leaves (Cognitive Traps to Prune)
1. **Deep Nested Tabs:** Avoid tabs inside panels inside modals. They cause split-attention and memory resets.
2. **Subjective Code Health Scores:** Remove arbitrary letters (e.g., "Architecture Score: B+"). They create anxiety without explaining facts.
3. **Graph Hairballs:** Never show 500 nodes and 2,000 crisscrossing edges at once. Filter by directory clusters or active focus paths.
4. **Monolithic Code Views:** Do not dump 2,000 lines of code into sidebar panels. Collapse code into disclosure widgets and highlight only import lines by default.
5. **Developer Benchmark Chrome:** Hide continuous integration telemetry, raw test runners, and benchmark tables from learning environments.

### 4.3 What Reworks (How to Present Information)
1. **Single-Column Causal Flow:**
   Present module context in a single horizontal or vertical sequence:
   ```
   [ Upstream Dependencies ] ➔ [ Current Module ] ➔ [ Direct Callers ] ➔ [ Downstream Cascade ]
   ```
2. **Plain-Language Metrics:**
   Replace graph theory jargon with human questions:
   - Replace "In-Degree" with **Direct callers** ("Who calls this?").
   - Replace "Out-Degree" with **Depends on** ("What does this need?").
   - Replace "Transitive Blast Radius" with **Downstream dependents** ("What breaks if this changes?").
   - Replace "Degree Centrality" with **Most connected files**.
3. **Keyboard-First Navigation (Command Palette):**
   Provide a global keyboard shortcut (`Cmd+K` or `Ctrl+K`) for jumping to any file, filtering by directory, or running actions without requiring fine-motor mouse targeting.

---

## 5. Portable Implementation Guidelines

When building or refactoring tools under this framework, follow a strict three-phase cycle:

### Phase 1: Make It Work
- Build a pure, zero-DOM data model first.
- Ensure all graph calculations (entry points, transitive blast radius, cycles) run deterministically in headless environments (e.g., pure Node.js or Python).
- Write automated tests for data extraction before building user interface elements.

### Phase 2: Make It Right
- Separate calculations from rendering:
  - Component 1: **View-Model Presenter** (derives plain-language strings, role classifications, and causal lists).
  - Component 2: **Renderer** (pure DOM, Canvas, or Terminal output).
- Keep cyclomatic complexity under 10 for every rendering function.
- Enforce strict contrast standards (WCAG 2.1 AA minimum: 4.5:1 for normal text, 7:1 for headers).

### Phase 3: Follow Practice
- Maintain zero circular dependencies across internal modules.
- Ensure that every rendered path exists in the repository.
- Verify that keyboard navigation works without mouse interaction.

---

## 6. Project Audit Checklist

Use this checklist to evaluate any codebase, developer documentation, or navigation tool:

- [ ] **Entry Points:** Are entry points (execution roots) visibly tagged and discoverable in under 5 seconds?
- [ ] **Deterministic Edges:** Are all module relationships proven directly from real code imports?
- [ ] **No Visual Overlap:** Do all diagrams enforce strict collision prevention so text is never obscured?
- [ ] **Causal Breadcrumbs:** Can a user see upstream dependencies and downstream callers without opening new tabs?
- [ ] **LOD Zooming:** Does the view hide micro-text at distant zoom levels to prevent sensory crowding?
- [ ] **Plain Terminology:** Are graph theory terms replaced with plain questions ("Direct callers", "Depends on")?
- [ ] **Cycle Guidance:** Are circular dependencies accompanied by clear refactoring steps?
- [ ] **Quiet Interface:** Is the background dark, quiet, and free from flashing animations or non-essential telemetry?
- [ ] **Clickable Links:** Does clicking any referenced file path immediately navigate to that file?
- [ ] **Keyboard Navigation:** Can users search, jump, and filter entirely via `Cmd+K` / `Ctrl+K`?

---

## 7. Key Literature Citations

1. **Baddeley, A.** (2000). The episodic buffer: A new component of working memory? *Trends in Cognitive Sciences*, 4(11), 417–423.
2. **Barkley, R. A.** (1997). Behavioral inhibition, sustained attention, and executive functions. *Psychological Bulletin*, 121(1), 65–94.
3. **Baron-Cohen, S.** (2009). Autism: The empathizing-systemizing theory. *Annals of the New York Academy of Sciences*, 1156(1), 68–80.
4. **Chandler, P., & Sweller, J.** (1992). The split-attention effect in multimedia learning. *British Journal of Educational Psychology*, 62(2), 233–246.
5. **Cowan, N.** (2001). The magical number 4 in short-term memory. *Behavioral and Brain Sciences*, 24(1), 87–114.
6. **Eide, B. L., & Eide, F. F.** (2011). *The Dyslexic Advantage*. Penguin.
7. **Ko, A. J., Myers, B. A., et al.** (2006). Information foraging in software maintenance. *IEEE Transactions on Software Engineering*, 32(12), 971–987.
8. **Mark, G., Gudith, D., & Klocke, U.** (2008). The cost of interrupted work. *Proceedings of SIGCHI*, 107–110.
9. **Paivio, A.** (1986). *Mental Representations: A Dual Coding Approach*. Oxford University Press.
10. **Pirolli, P., & Card, S.** (1999). Information foraging. *Psychological Review*, 106(4), 643–675.
11. **Sillito, J., Murphy, G. C., & De Volder, K.** (2008). Asking and answering questions during a programming change task. *IEEE Transactions on Software Engineering*, 34(4), 434–451.
12. **Storey, M. A., Wong, K., & Müller, H. A.** (2000). How do program understanding tools affect how programmers understand programs? *Science of Computer Programming*, 36(2-3), 183–207.
13. **Sweller, J.** (1988). Cognitive load during problem solving. *Cognitive Science*, 12(2), 257–285.
14. **West, T. G.** (2017). *In the Mind's Eye: Creative Visual Thinkers, Gifted Dyslexics, and Spatial Cognition*. Prometheus Books.
