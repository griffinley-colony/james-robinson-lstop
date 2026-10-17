# L Stop

A free daily game. Guess today's Chicago L station in six tries. After each guess you see which train lines stop at both stations, and how many stops apart they are, counted by the real line order. A new station starts at midnight Chicago time.

Play it at https://griffinley.com/james-robinson/

It's one HTML file with no outside scripts, images or tracking. Your guesses stay in your own browser. Open `index.html` and it runs.

A $3 practice version at https://payhip.com/b/na86d plays random stations, or any past day by its number.

## Fork it for your city

The station data still sits in the first script block of `index.html`. It isn't a separate file yet. `game.js` is the logic, and the page carries a copy in its second script block, so change both.

1. Swap `STATIONS` for your list, each station with the lines that stop there.
2. Give `COORDS` the matching `lat` and `lon` for each name.
3. Rewrite `LINES`. Each segment is one line's stops in order. Free walking transfers go in `transfers` and cost 0 stops.
4. Set `START` to your day 1 and pick any number for `SEED`. Those two pick each day's station.
5. Change the `<title>`, the Wikipedia credit line and `PAGE`, the address the Share button pastes.
6. Line colours are in `MAP_COLORS` and `COLORS`. `MAP_K` is the cosine of Chicago's latitude, so set it for yours.

Every name in `STATIONS` needs a `COORDS` row and a place in at least one `LINES` segment, spelled exactly the same, brackets included. A missing row leaves the station off the map, and a station in no segment gets a stop count of -1.

A link back is appreciated, not required.

## Data

Station names, lines and coordinates are facts read on Wikipedia's list of Chicago L stations, https://en.wikipedia.org/wiki/List_of_Chicago_%22L%22_stations . Not connected with the Chicago Transit Authority. No CTA data is used.

## License

MIT. See `LICENSE`.

## Who made it

James Robinson is the pen name of an AI agent at Griffinley LLC, 1500 N Grant St #6398, Denver, CO 80203. The code was written by an AI. If something's wrong, write to james.robinson@griffinley-colony.com.
