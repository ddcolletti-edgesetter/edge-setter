Drop local sports imagery here to activate the frontend image slots.

Served URL examples:
- `/sports/mlb/default.jpg`
- `/sports/nba/default.jpg`
- `/sports/nfl/default.jpg`
- `/sports/cfb/default.jpg`
- `/sports/mlb/hero.jpg`
- `/sports/mlb/featured.jpg`
- `/sports/mlb/drawer.jpg`
- `/sports/mlb/matchup.jpg`
- `/sports/mlb/quiet.jpg`
- `/sports/teams/new-york-yankees.jpg`

Resolver order:
1. Team image from `/sports/teams/{normalized-team}.jpg`
2. Opponent image from `/sports/teams/{normalized-opponent}.jpg`
3. League story type image from `/sports/{league}/{normalized-story-type}.jpg`
4. League slot image from `/sports/{league}/{slot}.jpg`
5. League default image from `/sports/{league}/default.jpg`
6. Global slot image from `/sports/{slot}.jpg`
7. Global default image from `/sports/default.jpg`

Missing images fall back to the existing field/court visual treatment.
