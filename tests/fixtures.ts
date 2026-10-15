export const SOURCE_A = {
  title: 'Central bank holds interest rates at 4.5% as inflation eases to 3.1%',
  text: `The Bank of Eastland left its benchmark interest rate unchanged at 4.5% on Thursday, saying inflation had eased to 3.1% in August from 3.6% in July. Governor Maria Okonkwo told reporters in Capital City that the nine-member committee voted 7-2 to hold rates. "We need to see sustained progress before we can consider easing policy," Okonkwo said. Two members had argued for a quarter-point cut. Economists polled by the news agency had expected the decision. The bank forecast that inflation would return to its 2% target by the middle of 2027. Unemployment stood at 4.2%, little changed from the previous month. Financial markets saw a roughly 60% chance of a cut by December, according to pricing data. The Eastland dollar rose 0.4% against the euro after the announcement.`,
};

// Same event, different outlet and wording
export const SOURCE_B = {
  title: 'Eastland keeps rates steady; two policymakers wanted a cut',
  text: `Eastland's central bank kept borrowing costs at 4.5% on Thursday, with Governor Maria Okonkwo saying officials need to see lasting progress on prices before easing. The monetary committee split 7-2, with two members favouring a cut of 25 basis points. Consumer price inflation slowed to 3.1% in August, down from 3.6% a month earlier. The Bank of Eastland now expects inflation to reach its 2% goal by mid-2027. The currency strengthened 0.4% versus the euro.`,
};

// Unrelated story
export const SOURCE_C = {
  title: 'Local team wins championship after dramatic penalty shootout',
  text: `Riverside United won the national football championship on Saturday after beating Harbour City 5-4 on penalties following a 2-2 draw in front of 52,000 fans at the National Stadium. Goalkeeper Tomas Havel saved two spot-kicks in the shootout. Coach Elena Petrova said the squad had worked all season for the moment. It is the club's first title since 1998.`,
};

export const GOOD_ARTICLE_BODY = `Eastland's central bank has decided to keep its main interest rate where it is, at 4.5%, after a split vote on Thursday.

Seven of the nine members of the rate-setting committee backed leaving borrowing costs unchanged, while two wanted to lower them by a quarter of a percentage point, the Bank of Eastland said.

Speaking to journalists in Capital City, Governor Maria Okonkwo said policymakers were not yet ready to loosen policy. "We need to see sustained progress before we can consider easing policy," she said.

Price growth has been cooling. Annual inflation fell to 3.1% in August from 3.6% in July, which is still above the 2% target the bank says it expects to reach by the middle of 2027, according to the bank's own forecasts.

The jobless rate was reported at 4.2%, barely different from a month earlier. Traders now put the odds of a reduction by December at around 60%, based on market pricing, and the Eastland dollar edged up 0.4% against the euro after the announcement.

The account draws on reporting by Example Wire.`;

// Same topic, DIFFERENT event (another country's central bank): must NOT be treated as a duplicate.
export const SOURCE_D = {
  title: 'Westmark central bank cuts interest rates to 3.0% as inflation falls to 2.4%',
  text: `The Westmark Reserve cut its main interest rate by a quarter point to 3.0% on Thursday, citing inflation that has eased to 2.4% in August from 2.9% in July. Governor Henrik Lund told reporters in Northport that the board voted 6-3 in favour of the cut. "Price pressures are fading faster than we projected," Lund said. The bank expects inflation to settle at its 2% target by the end of 2026. Unemployment in Westmark held at 5.1%. Markets had priced a cut, and the Westmark krona slipped 0.3% against the dollar after the announcement.`,
};
