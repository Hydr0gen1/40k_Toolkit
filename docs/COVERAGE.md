# Live data coverage

Checked 2026-10-02T03:11:14.492Z. Snapshot: `11e-2026-10-02-032e96cc04ba`. Edition: 11th. Points version: MFM 1.5.

The live refresh imported **126 unit entries**, including **75 entries on the Black Templars official page**, **18 detachments**, and **483 searchable rule/reference records**. 123 unit entries have an exact community profile match. These counts do not establish complete rules coverage.

## Source inventory

| Source ID                       | Authority | Version                                  | Link                                                                                                                                                       |
| ------------------------------- | --------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mfm-bt                          | official  | 1.5                                      | [source](https://mfm.warhammer-community.com/en/black-templars)                                                                                            |
| bsdata-core                     | community | 8fb1191701cc596c817d5d1ea96f90009f37f11d | [source](https://raw.githubusercontent.com/BSData/wh40k-11e/8fb1191701cc596c817d5d1ea96f90009f37f11d/Warhammer%2040%2C000.json)                            |
| mfm-transcription               | community | 1.5                                      | [source](https://raw.githubusercontent.com/BSData/wh40k-11e-mfm/main/data/meta.yaml)                                                                       |
| bsdata-black-templars           | community | 8fb1191701cc596c817d5d1ea96f90009f37f11d | [source](https://raw.githubusercontent.com/BSData/wh40k-11e/8fb1191701cc596c817d5d1ea96f90009f37f11d/Imperium%20-%20Black%20Templars.json)                 |
| bsdata-space-marines            | community | 8fb1191701cc596c817d5d1ea96f90009f37f11d | [source](https://raw.githubusercontent.com/BSData/wh40k-11e/8fb1191701cc596c817d5d1ea96f90009f37f11d/Imperium%20-%20Space%20Marines.json)                  |
| bsdata-agents-of-the-imperium   | community | 8fb1191701cc596c817d5d1ea96f90009f37f11d | [source](https://raw.githubusercontent.com/BSData/wh40k-11e/8fb1191701cc596c817d5d1ea96f90009f37f11d/Imperium%20-%20Agents%20of%20the%20Imperium.json)     |
| bsdata-imperial-knights-library | community | 8fb1191701cc596c817d5d1ea96f90009f37f11d | [source](https://raw.githubusercontent.com/BSData/wh40k-11e/8fb1191701cc596c817d5d1ea96f90009f37f11d/Imperium%20-%20Imperial%20Knights%20-%20Library.json) |
| mfm-imperial-agents             | official  | 1.5                                      | [source](https://mfm.warhammer-community.com/en/imperial-agents)                                                                                           |
| mfm-imperial-knights            | official  | 1.5                                      | [source](https://mfm.warhammer-community.com/en/imperial-knights)                                                                                          |

The [official edition announcement](https://www.warhammer-community.com/en-gb/articles/nhqt9wx3/new40k-rules-download-the-free-core-rules-now/) identifies the current edition. The [official downloads hub](https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/) remains the place to check FAQs, balance changes and faction updates; those documents are not yet fully ingested or encoded here.

## Confirmed behavior

- Official MFM pages are parsed directly with structural validation, including requisition tiers, paid equipment, attachment lists, DP and unique tags.
- Imperial Agents uses the explicitly labeled Imperium allied pricing section rather than its in-faction prices. Availability as an ally still requires rules verification.
- Community catalogues are pinned to one commit per snapshot. Conditional modifiers are not silently interpreted as unconditional unit stats.
- The upstream core catalogue explicitly says Space Marine variants await an update after Saturday the 3rd. The service preserves that warning under the searchable catalogue-status reference.
- Both live-format smoke tests returned incomplete, as intended. No real list has been certified as fully legal.

## Unresolved coverage

- Community profiles and conditional rules are reference data; not a complete executable rules interpretation.
- Detachment-specific restrictions, allied permissions and transport exceptions require verification.
- Official FAQ/balance document coverage and mission-pack currency are not automatically certified.
- Muster rules are a community transcription; verify against the official app or MFM panel.
- Upstream catalogue reports pending faction updates; see catalogue-status.

Equipment combination rules are not comprehensively executable. Conditional detachments, transports, allied limits and special datasheet interactions require reviewed data or further implementation. Support for synthetic complete datasets proves validator behavior; it does not substitute for review of live faction rules.

## Tournament evidence

The public feed returned 10 recent article leads. 10 fetched article pages returned an access challenge. No verified event results were invented. Accessible article bodies can supply conservative factual hints; administrator-reviewed records can be imported with dates, format, rules version and results. A 90-day search filters stored records; it does not imply complete coverage of every event in that period.

## Release boundary

This is a working service with partial rule and research coverage. Before tournament reliance, complete the missing source review, encode remaining conditional checks, and verify the specific event rules. The server intentionally reports incomplete until that work is substantiated.
