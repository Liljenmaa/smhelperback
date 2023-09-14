% hero(heroname).
${HEROES}

% player(playername).
${PLAYERS}

point(5).
point(4).
point(3).
point(2).
point(1).

% sel(playername, heroname, priority).
${SELECTIONS}

{ finalsel(Player, Hero, Point): sel(Player, Hero, Point) } = 1 :- player(Player).
:- finalsel(P1, H, O1), finalsel(P2, H, O2), P1!=P2.
% :- finalsel(_, _, 2).
% :- finalsel(_, _, 1).

total(S) :- S = #sum{ O, P, H: finalsel(P, H, O) }.

% :- not total(num). || #maximize { S: total(S) }.
${OPTIMIZE}

#show finalsel/3.
