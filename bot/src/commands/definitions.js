export const COMMANDS = [
  { name: 'standings', description: 'Show the current season standings', type: 1 },
  {
    name: 'player',
    description: "Look up a player's career stats",
    type: 1,
    options: [{ name: 'name', description: 'Player name', type: 3, required: true, autocomplete: true }],
  },
  {
    name: 'compare',
    description: "Compare two players' stats side by side",
    type: 1,
    options: [
      { name: 'player1', description: 'First player', type: 3, required: true, autocomplete: true },
      { name: 'player2', description: 'Second player', type: 3, required: true, autocomplete: true },
    ],
  },
  {
    name: 'leaders',
    description: "Show this season's stat leaders",
    type: 1,
    options: [{
      name: 'category',
      description: 'Stat category',
      type: 3,
      required: false,
      choices: [
        { name: 'Batting Average', value: 'avg' },
        { name: 'Home Runs', value: 'hr' },
        { name: 'RBI', value: 'rbi' },
        { name: 'OPS', value: 'ops' },
        { name: 'ERA', value: 'era' },
        { name: 'Strikeouts', value: 'k' },
      ],
    }],
  },
  { name: 'nextgame', description: 'Show the next scheduled game', type: 1 },
  {
    name: 'team',
    description: 'Show a team\'s record and roster',
    type: 1,
    options: [{ name: 'name', description: 'Team name', type: 3, required: true, autocomplete: true }],
  },
  {
    name: 'awards',
    description: 'Show a season\'s award winners',
    type: 1,
    options: [{ name: 'season', description: 'Season number or name', type: 3, required: false, autocomplete: true }],
  },
  { name: 'transactions', description: 'Show the most recent roster moves', type: 1 },
  { name: 'news', description: 'Show the latest league news', type: 1 },
  { name: 'help', description: 'List everything this bot can do', type: 1 },
];
