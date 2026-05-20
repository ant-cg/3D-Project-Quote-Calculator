# 3D Project Quote Calculator

A lightweight browser-based pricing tool built for **3D artists and freelancers** who want structured, consistent, and professional project estimates.

This calculator helps eliminate guesswork, prevent underpricing, and create transparent quotes for commissions and production work.

![3D Project Quote Calculator](img/QuoteCalc.jpg)

---

## Overview

The **3D Project Quote Calculator** estimates project pricing based on:

* Selected production tasks
* Complexity levels
* Business modifiers
* Ownership and timeline variables
* Client and country tiers

It is designed to reflect real-world freelance workflows while remaining simple and fast to use.

No installation. No backend. Just open and calculate.

---

## Features

### Production Tasks

* Modeling
* Texturing / UVs
* Shaders / Materials
* Rigging
* Animation
* Blueprint / Logic Systems
* VFX / Particles
* Scene Assembly
* Lighting
* Rendering
* Compositing
* Optimization

Each task includes **complexity scaling**, ensuring pricing reflects actual project scope.

---

### Business Modifiers

* Client tier multipliers (Personal, Studio, Enterprise)
* Country pricing tiers
* Asset reuse discounts
* Rush timeline multipliers
* Short-deadline surcharge
* IP ownership adjustments
* Base minimum protection
* Cleanup cost support

This ensures quotes are both creative-aware and business-aware.

---

## Pricing Philosophy

This tool is built around **project value and complexity**, not hourly punishment.

Efficient artists should not earn less because they work faster.

Instead of charging by time, pricing scales based on:

* Scope
* Complexity
* Responsibility
* Client type
* Market tier

---

## How To Use

1. Download or clone the repository
2. Open `index.html` in your browser
3. Select the tasks required for your project
4. Adjust complexity and business modifiers
5. Click **Calculate Quote**

The tool will instantly generate a structured estimate.

No installation or server required.

---

## Customizing Your Prices

All pricing values are stored in `config.json`, making customization simple.

Example:

```json
{
  "baseRates": {
    "modeling": 50,
    "texturing": 20,
    "shaders": 40,
    "rigging": 100,
    "animation": 100,
    "blueprints": 20,
    "vfx": 80
  },
  "baseMinimum": 80,
  "cleanupCost": 150,
  "rushMultiplier": 1.4,
  "rushShortTimelineMultiplier": 1.3,
  "rushShortTimelineDays": 7,
  "ipDiscountMultiplier": 0.85
}
```

You can modify:

* `baseRates` to reflect your service value
* `clientTiers` multipliers
* `countryTiers` multipliers
* `rushMultiplier` for urgent projects
* `ipDiscountMultiplier` if you retain ownership
* `baseMinimum` to protect against underpricing

After editing the file, refresh the page and the updated values will apply automatically.

---

## Who This Is For

* Freelance 3D artists
* Game artists
* VR / AR creators
* Technical artists
* Indie studios
* Artists who struggle with pricing consistency

If you price creative work and want more structure than a spreadsheet, this tool is for you.

---

## Tech Stack

* HTML
* CSS
* JavaScript
* JSON configuration

Simple. Transparent. Customizable.

---

## License

MIT License

Copyright (c) 2026 Anthony Chavarría 
| GitHub: https://github.com/ant-cg

Free to use, modify, and share under the terms of the MIT License.
Please retain the original license notice.