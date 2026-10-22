"""Curated NFL rules and terms in plain English (Sideline's own text, not an AI's memory).

The assistant answers rules / "what does X mean" questions from these entries via `lookup_rule`.
Recent rule changes (kickoff, onside kick, overtime) are written for the 2025 season, the season Sideline
replays, from the NFL's own rule explainers (operations.nfl.com, nfl.com). Applies to the NFL only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Entry:
    term: str
    category: str
    text: str
    aliases: tuple[str, ...] = ()


GLOSSARY: tuple[Entry, ...] = (
    # ---------------------------------------------------------------- basics
    Entry(
        "Downs and distance",
        "basics",
        "The offense gets four tries (downs) to move the ball 10 yards. Gain the 10 yards and you get a "
        "new set of downs (a first down). '3rd & 4' means it's third down with 4 yards still to go.",
        ("down", "first down", "3rd and", "third down", "and goal", "line to gain", "chains"),
    ),
    Entry(
        "Fourth down",
        "basics",
        "On fourth down a team usually punts (kicks the ball away), tries a field goal, or 'goes for it'. "
        "If it goes for it and comes up short, the other team takes over right there.",
        ("4th down", "go for it", "going for it", "turnover on downs"),
    ),
    Entry(
        "Line of scrimmage",
        "basics",
        "The imaginary line where the ball is placed before each play. Neither team may cross it before the snap.",
        ("scrimmage", "los"),
    ),
    Entry(
        "Snap",
        "basics",
        "The center hands or tosses the ball back between his legs (usually to the quarterback) to start a play.",
        ("hike",),
    ),
    Entry(
        "Red zone",
        "basics",
        "The area between the opponent's 20-yard line and the goal line. Drives that reach it score far "
        "more often, so 'red zone efficiency' is a common stat.",
        ("redzone",),
    ),
    Entry(
        "Turnover",
        "basics",
        "When the offense loses the ball to the defense: an interception, a lost fumble, or failing on "
        "fourth down (turnover on downs).",
        ("turnover margin", "giveaway", "takeaway"),
    ),
    Entry(
        "Interception",
        "basics",
        "A pass caught by a defender. The defense takes possession and can return it, even for a touchdown "
        "(a 'pick-six').",
        ("pick", "int", "pick six", "pick-six"),
    ),
    Entry(
        "Fumble",
        "basics",
        "A player loses the ball while it's live. Either team can recover it; if the defense recovers, it's "
        "a lost fumble (a turnover). A ball that hits the ground on an incomplete forward pass is not a "
        "fumble.",
        ("fumbled", "strip", "lost fumble"),
    ),
    Entry(
        "Sack",
        "basics",
        "The quarterback is tackled behind the line of scrimmage before he can throw. The lost yards count "
        "against the offense.",
        ("sacked",),
    ),
    Entry(
        "Catch",
        "basics",
        "A legal catch needs control of the ball, both feet (or another body part other than the hands) "
        "down in bounds, and holding it long enough to make a normal football move. If the ball comes loose "
        "while going to the ground before that, it's incomplete.",
        ("completion", "reception", "catch rule", "incomplete", "incompletion"),
    ),
    Entry(
        "Touchback",
        "basics",
        "When a kick or turnover ends in the end zone and the ball is downed there. On punts and most "
        "turnovers the offense starts at its own 20; a kickoff that reaches the end zone in the air and is "
        "downed starts at the 35 (2025 rule).",
        ("touch back",),
    ),
    # ---------------------------------------------------------------- scoring
    Entry(
        "Touchdown",
        "scoring",
        "6 points: carrying the ball into the opponent's end zone, or catching or recovering it there. The "
        "scoring team then tries an extra point (1) or a two-point conversion (2).",
        ("td", "score a touchdown", "rushing touchdown", "passing touchdown"),
    ),
    Entry(
        "Extra point",
        "scoring",
        "After a touchdown, a kick through the uprights from a snap at the 15-yard line (about a 33-yard "
        "kick) for 1 point.",
        ("pat", "point after", "xp", "point after touchdown"),
    ),
    Entry(
        "Two-point conversion",
        "scoring",
        "After a touchdown, instead of kicking, the team runs one play from the 2-yard line. Get into the "
        "end zone and it's worth 2 points. Teams often try it late in games to reach a needed score.",
        ("2 point", "two point", "2-point", "go for two", "two-point try"),
    ),
    Entry(
        "Field goal",
        "scoring",
        "3 points for kicking the ball through the uprights from the field. The kick is about 17 yards "
        "longer than the line of scrimmage (10 yards of end zone plus about 7 yards for the snap and hold).",
        ("fg", "kick a field goal", "field goal range"),
    ),
    Entry(
        "Safety",
        "scoring",
        "2 points for the defense when the offense is tackled (or commits certain fouls) in its own end "
        "zone. The team that gave up the safety then has to kick the ball to the other team.",
        ("safety score",),
    ),
    # ---------------------------------------------------------------- kicking
    Entry(
        "Kickoff",
        "kicking",
        "Starts each half and follows every score. Under the NFL's dynamic kickoff (introduced in 2024, made "
        "permanent for 2025): the kicker kicks from his own 35; his 10 teammates line up at the receiving "
        "team's 40; the receiving team puts 9 blockers in a 'setup zone' between its own 35 and 30, and up to"
        " 2 returners in the 'landing zone' (its goal line to its 20). Nobody except the kicker and returners"
        " may move until the ball hits the ground or a player in the landing zone. A kick that lands in the "
        "landing zone must be returned; a kick that lands short of it gives the receiving team the ball at "
        "its own 40; a kick that reaches the end zone in the air can be returned or downed for a touchback at"
        " the 35 (2025).",
        ("kick off", "dynamic kickoff", "kick return"),
    ),
    Entry(
        "Onside kick",
        "kicking",
        "A short kickoff the kicking team tries to recover itself. Teams must declare it in advance, and only"
        " a team that is behind may try one; since 2025 that's allowed at any point in the game, not just the"
        " 4th quarter. A declared onside kick uses a traditional lineup instead of the dynamic kickoff setup.",
        ("onside", "on-side kick"),
    ),
    Entry(
        "Punt",
        "kicking",
        "A kick on (usually) fourth down to push the other team back. The returner can run it back, signal "
        "a fair catch, or let it go.",
        ("punting", "punter", "punt return"),
    ),
    Entry(
        "Fair catch",
        "kicking",
        "A returner waves an arm before catching a kick: he can't be hit and can't advance the ball; his "
        "team takes over where he caught it.",
        ("fair-catch",),
    ),
    # ---------------------------------------------------------------- clock
    Entry(
        "Game clock",
        "clock",
        "Four 15-minute quarters. The clock stops for incomplete passes, scores, timeouts, penalties and "
        "change of possession. Running out of bounds stops it until the next snap in the last 2 minutes of "
        "the first half and the last 5 minutes of the game; otherwise it restarts once the ball is set. "
        "Unlike college, the NFL clock doesn't stop just because of a first down.",
        ("clock", "clock stops", "running clock", "out of bounds", "quarters", "how long is a game"),
    ),
    Entry(
        "Play clock",
        "clock",
        "The offense has 40 seconds from the end of the previous play (25 after certain stoppages) to snap "
        "the ball, or it's a delay-of-game penalty.",
        ("40 second", "25 second", "play-clock"),
    ),
    Entry(
        "Two-minute warning",
        "clock",
        "An automatic stoppage when 2:00 is left in each half: effectively a free timeout that shapes "
        "late-game strategy.",
        ("2 minute warning", "two minute warning"),
    ),
    Entry(
        "Timeouts",
        "clock",
        "Each team gets three timeouts per half. Saving them lets a trailing team stop the clock late; a "
        "team with the lead wants the clock to keep running.",
        ("timeout", "time out", "time-out"),
    ),
    Entry(
        "Kneel-down",
        "clock",
        "The quarterback takes the snap and immediately kneels to end the play and keep the clock running, "
        "used by a team with the lead to run out the clock.",
        ("kneel", "victory formation", "take a knee"),
    ),
    Entry(
        "Spike",
        "clock",
        "The quarterback throws the ball straight into the ground right after the snap to stop the clock. "
        "It uses up a down.",
        ("spike the ball", "clock spike"),
    ),
    Entry(
        "Overtime",
        "clock",
        "If a game is tied after four quarters, there's overtime: a 10-minute period in the regular season, "
        "15-minute periods in the playoffs. Since 2025 the regular season works like the playoffs: both teams"
        " get a possession even if the first team scores a touchdown. After that, the next score wins. "
        "Regular-season games can still end in a tie; playoff games can't.",
        ("ot", "over time", "sudden death", "tie game"),
    ),
    # ---------------------------------------------------------------- penalties
    Entry(
        "Penalty basics",
        "penalties",
        "A flag means a foul. Most cost 5, 10 or 15 yards; some also give an automatic first down or cost "
        "a down. The team that was fouled can usually accept or decline the penalty.",
        ("penalty", "flag", "foul", "yellow flag", "accept or decline", "declined"),
    ),
    Entry(
        "False start",
        "penalties",
        "An offensive player moves (in a way that simulates the snap) before the ball is snapped. 5 yards; "
        "the play doesn't happen.",
        ("false-start",),
    ),
    Entry(
        "Offside / encroachment",
        "penalties",
        "A defender is across the line of scrimmage at the snap (offside), or crosses and touches an "
        "opponent before the snap (encroachment), or draws an offensive player into moving (neutral zone "
        "infraction). 5 yards.",
        ("offside", "offsides", "encroachment", "neutral zone infraction", "jumped"),
    ),
    Entry(
        "Holding",
        "penalties",
        "Illegally grabbing or restricting an opponent. Offensive holding is 10 yards. Defensive holding is "
        "5 yards and an automatic first down.",
        ("hold", "offensive holding", "defensive holding"),
    ),
    Entry(
        "Pass interference",
        "penalties",
        "Illegally hindering a player's chance to catch a pass after it's thrown. Defensive pass "
        "interference gives the offense the ball at the spot of the foul with a first down (or at the "
        "1-yard line if it's in the end zone). Offensive pass interference is 10 yards.",
        ("pi", "dpi", "opi", "interference"),
    ),
    Entry(
        "Illegal contact",
        "penalties",
        "A defender makes contact with a receiver more than 5 yards past the line of scrimmage before the "
        "ball is thrown. 5 yards and an automatic first down.",
        ("illegal-contact",),
    ),
    Entry(
        "Roughing the passer",
        "penalties",
        "Hitting the quarterback late, low, in the head or neck area, or with too much force after he "
        "throws. 15 yards and an automatic first down.",
        ("roughing", "roughing the quarterback"),
    ),
    Entry(
        "Personal fouls",
        "penalties",
        "15-yard fouls for dangerous or unsportsmanlike contact: unnecessary roughness, face mask, "
        "horse-collar tackle, unnecessary hits on defenseless players. On the defense they also give an "
        "automatic first down.",
        ("personal foul", "unnecessary roughness", "face mask", "facemask", "horse collar", "horse-collar"),
    ),
    Entry(
        "Unsportsmanlike conduct",
        "penalties",
        "15 yards for things like taunting or excessive celebration. Two unsportsmanlike fouls in a game get "
        "a player ejected.",
        ("unsportsmanlike", "taunting", "celebration", "ejected", "ejection"),
    ),
    Entry(
        "Delay of game",
        "penalties",
        "The offense doesn't snap the ball before the play clock hits zero. 5 yards.",
        ("delay-of-game",),
    ),
    Entry(
        "Intentional grounding",
        "penalties",
        "A quarterback under pressure throws the ball away with no eligible receiver nearby, while still in "
        "the area between the tackles. Loss of down and 10 yards (or the spot of the foul); in his own end "
        "zone it's a safety.",
        ("grounding",),
    ),
    Entry(
        "Too many men on the field",
        "penalties",
        "A team has more than 11 players on the field. 5 yards.",
        ("12 men", "too many players", "illegal substitution"),
    ),
    Entry(
        "Illegal block in the back",
        "penalties",
        "Blocking an opponent from behind above the waist, often on returns. 10 yards.",
        ("block in the back", "clipping"),
    ),
    # ---------------------------------------------------------------- replay
    Entry(
        "Replay review and challenges",
        "replay",
        "Coaches can challenge certain calls by throwing a red flag (two challenges a game, a third if both "
        "succeed). Scoring plays and turnovers are reviewed automatically, as are plays in the last two "
        "minutes of each half and overtime when the replay official stops the game.",
        ("challenge", "red flag", "review", "replay", "booth review", "overturned", "call stands"),
    ),
    # ---------------------------------------------------------------- positions
    Entry(
        "Quarterback (QB)",
        "positions",
        "Leads the offense: takes the snap, hands off or passes. The most important position on the field.",
        ("quarterback", "qb", "passer"),
    ),
    Entry(
        "Running back (RB)",
        "positions",
        "Lines up behind or beside the quarterback, mostly runs the ball, also catches short passes and blocks.",
        ("running back", "rb", "halfback", "tailback", "rusher"),
    ),
    Entry(
        "Wide receiver (WR)",
        "positions",
        "Lines up wide and runs routes to catch passes.",
        ("wide receiver", "wr", "receiver", "wideout"),
    ),
    Entry(
        "Tight end (TE)",
        "positions",
        "Lines up next to the offensive line; both blocks and catches passes.",
        ("tight end", "te"),
    ),
    Entry(
        "Offensive line",
        "positions",
        "Five blockers (center, two guards, two tackles) who protect the quarterback and open running lanes.",
        ("offensive line", "o-line", "oline", "lineman", "center", "guard", "tackle"),
    ),
    Entry(
        "Defensive positions",
        "positions",
        "Defensive linemen (ends and tackles) rush the passer and stop the run; linebackers play behind "
        "them; cornerbacks cover receivers on the outside; safeties are the last line of defense deep.",
        ("defensive line", "linebacker", "lb", "cornerback", "cb", "safety position", "edge rusher", "dline"),
    ),
    Entry(
        "Special teams",
        "positions",
        "The units on the field for kicks: kickoffs, punts, field goals and extra points, plus their returns.",
        ("special teams", "kicker", "returner", "long snapper"),
    ),
    # ---------------------------------------------------------------- strategy / plays
    Entry(
        "Play-action",
        "strategy",
        "The quarterback fakes a handoff before passing, to freeze defenders who expect a run.",
        ("play action", "pa"),
    ),
    Entry(
        "Blitz",
        "strategy",
        "The defense sends extra rushers (beyond the usual four) after the quarterback, risking big plays "
        "if he gets the ball out quickly.",
        ("blitzing",),
    ),
    Entry(
        "Hail Mary",
        "strategy",
        "A long, desperate pass into the end zone, usually on the last play of a half.",
        ("hail mary pass",),
    ),
    Entry(
        "Two-minute drill",
        "strategy",
        "A fast, no-huddle style of offense late in a half, using the sidelines and timeouts to save clock.",
        ("hurry up", "no huddle", "no-huddle"),
    ),
    # ---------------------------------------------------------------- stats used in Sideline
    Entry(
        "Passer rating",
        "stats",
        "A formula (0 to 158.3) combining completion percentage, yards per attempt, touchdowns and "
        "interceptions per attempt. Sideline doesn't compute it; it shows completions, attempts, yards, TDs "
        "and INTs.",
        ("qb rating", "passer rating"),
    ),
    Entry(
        "Win probability",
        "stats",
        "In Sideline this is nflverse's model estimate of the home team's chance to win from the current "
        "score, time, down, distance and field position. It's an estimate, not a prediction of what will "
        "happen.",
        ("win prob", "win probability", "chance to win", "odds"),
    ),
    Entry(
        "Yards per carry / per catch",
        "stats",
        "Rushing yards divided by carries, or receiving yards divided by catches. Common ways to judge "
        "efficiency rather than volume.",
        ("ypc", "yards per carry", "yards per catch", "efficiency"),
    ),
    # ---------------------------------------------------------------- league
    Entry(
        "League structure",
        "league",
        "32 teams in two conferences (AFC and NFC), each with four divisions of four teams. The regular "
        "season is 17 games over 18 weeks (each team has one bye week).",
        ("conference", "division", "afc", "nfc", "how many games", "bye week", "bye", "season length"),
    ),
    Entry(
        "Playoffs",
        "league",
        "Seven teams per conference make the playoffs: four division winners and three wild cards. Only the "
        "top seed in each conference gets a first-round bye. The conference champions meet in the Super "
        "Bowl.",
        ("playoff", "wild card", "postseason", "super bowl", "seeding", "seed"),
    ),
)

_WORD = re.compile(r"[a-z0-9]+")
#: Filler words never count as a match ("pizza in new haven" must not match "block in the back").
_STOP = frozenset(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "can",
        "do",
        "does",
        "for",
        "from",
        "how",
        "i",
        "in",
        "is",
        "it",
        "its",
        "me",
        "mean",
        "means",
        "of",
        "on",
        "or",
        "s",
        "so",
        "that",
        "the",
        "this",
        "to",
        "was",
        "what",
        "whats",
        "when",
        "where",
        "who",
        "why",
        "with",
        "work",
        "works",
        "worth",
        "explain",
        "tell",
        "about",
    ]
)


def _words(text: str) -> set[str]:
    return set(_WORD.findall(text.lower())) - _STOP


def search(query: str, limit: int = 3) -> list[Entry]:
    """Best-matching entries: exact alias/term phrase matches first, then word overlap."""
    q = query.lower().strip()
    qw = _words(q)
    scored: list[tuple[float, int, Entry]] = []
    for i, e in enumerate(GLOSSARY):
        names = (e.term.lower(), *e.aliases)
        score = 0.0
        for name in names:
            if re.search(rf"(?<![a-z0-9]){re.escape(name)}(?![a-z0-9])", q):
                score = max(score, 10 + len(name))  # longer phrase = more specific
        overlap = len(qw & _words(" ".join(names)))
        score += overlap * 2 + 0.2 * len(qw & _words(e.text))
        if score > 0.5:
            scored.append((score, -i, e))
    scored.sort(reverse=True)
    return [e for _, _, e in scored[:limit]]
