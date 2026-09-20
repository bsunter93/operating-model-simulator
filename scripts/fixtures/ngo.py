"""Riverbank Trust: an organisation that does not own its own money.

Everything here turns on restriction. Income arrives as grants with a purpose attached,
so the Trust can be short of money and holding money at the same time, and routinely is.
The people who win the next grant are the only ones no grant will pay for, which is the
oldest problem in the sector and the one this model exists to show.
"""
import json, collections
MONTHS = [f"2027-{m:02d}" for m in range(1, 13)]

def team(i, name, kind, fte, attr, shrink, target, cost, burnout=None, carry=None):
    t = collections.OrderedDict(id=i, name=name, teamType=kind, currentFte=fte,
        annualAttrition=attr, shrinkage=shrink, targetUtilization=target, monthlyFteCost=cost)
    if burnout is not None: t["burnoutSensitivity"] = burnout
    if carry is not None: t["backlog"] = {"carryForward": carry}
    return t

teams = [
    team("team-field", "Field Delivery", "operational", 120, 0.24, 0.26, 0.82, 2600, 0.9, 0.85),
    team("team-chw", "Community Health Workers", "operational", 180, 0.28, 0.3, 0.8, 1450, 0.9, 0.8),
    team("team-logistics", "Supply and Logistics", "operational", 38, 0.2, 0.22, 0.8, 2200, 0.9, 0.9),
    team("team-me", "Monitoring and Evaluation", "portfolio-and-run", 26, 0.18, 0.2, 0.82, 3400, 0.8, 0.95),
    team("team-programmes", "Programme Management", "portfolio-and-run", 22, 0.16, 0.2, 0.8, 4800, 0.7, 0.9),
    team("team-fundraising", "Fundraising and Partnerships", "portfolio-only", 12, 0.19, 0.18, 0.82, 5200, 0.7),
]

streams = [
    dict(id="demand-household-visits", name="Household visits", teamId="team-field", unit="visits",
         annualVolume=118000, handlingMinutesPerUnit=52, complexityFactor=1.0,
         workMix=dict(reusable=0.6, configurable=0.28, bespoke=0.12), seasonality="default"),
    dict(id="demand-chw-supervision", name="Health worker supervision", teamId="team-chw",
         unit="sessions", annualVolume=152000, handlingMinutesPerUnit=46, complexityFactor=1.0,
         workMix=dict(reusable=0.7, configurable=0.22, bespoke=0.08), seasonality="default"),
    dict(id="demand-supply-requests", name="Supply requests", teamId="team-logistics", unit="requests",
         annualVolume=16000, handlingMinutesPerUnit=62, complexityFactor=1.0,
         workMix=dict(reusable=0.65, configurable=0.25, bespoke=0.1), seasonality="default",
         answerWithinSeconds=172800),
    dict(id="demand-partner-requests", name="Partner and compliance requests", teamId="team-programmes",
         unit="requests", annualVolume=3200, handlingMinutesPerUnit=145, complexityFactor=1.0,
         workMix=dict(reusable=0.5, configurable=0.32, bespoke=0.18), seasonality="default",
         answerWithinSeconds=259200),
    dict(id="demand-donor-reports", name="Donor reporting", teamId="team-me", unit="reports",
         annualVolume=2100, handlingMinutesPerUnit=210, complexityFactor=1.0,
         workMix=dict(reusable=0.4, configurable=0.35, bespoke=0.25), seasonality="default",
         answerWithinSeconds=604800),
]

initiatives = [
    dict(id="init-water-points", name="Water point rehabilitation", startMonth="2027-01", durationMonths=9,
         requiredFteByTeam={"team-field": 18, "team-logistics": 4, "team-programmes": 3},
         strategicValue=9, financialValue=4200000, urgency=9, confidence=0.8,
         revenueAtRisk=4200000, executionFailureProbability=0.18, discretionary=False),
    dict(id="init-chw-training", name="Health worker training", startMonth="2027-02", durationMonths=8,
         requiredFteByTeam={"team-chw": 22, "team-me": 5, "team-programmes": 3},
         strategicValue=8, financialValue=3100000, urgency=8, confidence=0.82,
         revenueAtRisk=3100000, executionFailureProbability=0.16, discretionary=False),
    # The bid. This is how the year after this one gets paid for, and no grant will fund
    # the writing of it.
    dict(id="init-wash-renewal", name="WASH renewal bid", startMonth="2027-03", durationMonths=5,
         requiredFteByTeam={"team-fundraising": 8, "team-programmes": 3, "team-me": 4},
         strategicValue=10, financialValue=3800000, urgency=10, confidence=0.5,
         revenueAtRisk=3800000, executionFailureProbability=0.45, discretionary=False),
    dict(id="init-case-management", name="Digital case management", startMonth="2027-04", durationMonths=7,
         requiredFteByTeam={"team-me": 7, "team-programmes": 3, "team-field": 4},
         strategicValue=7, financialValue=900000, urgency=5, confidence=0.7,
         revenueAtRisk=0, executionFailureProbability=0.3, discretionary=True),
]

funds = [
    dict(id="fund-wash", name="WASH programme grant", funder="An institutional funder",
         amount=2900000, restrictedTo=dict(teamIds=["team-field", "team-logistics"]), confidence=1),
    dict(id="fund-health", name="Health systems grant", funder="A bilateral donor",
         amount=3550000, restrictedTo=dict(teamIds=["team-chw", "team-me"]), confidence=1),
    # Not banked. The whole second half of the year leans on it.
    dict(id="fund-wash-renewal", name="WASH renewal, second tranche", funder="The same institutional funder",
         amount=2600000, fromMonth="2027-07",
         restrictedTo=dict(teamIds=["team-field", "team-logistics"]), confidence=0.55),
    # The only money that can pay for anything, and the only money that pays for the people
    # who win the next grant.
    dict(id="fund-core", name="Unrestricted core funding", funder="Individual giving and reserves",
         amount=1850000, confidence=0.9),
]

model = collections.OrderedDict(
    modelVersion="3.0", id="riverbank-trust-2027", name="Riverbank Trust",
    status="calibrated", currency="USD", locale="en-US",
    lexicon=dict(revenueNoun="Grant income", customerNoun="The community"),
    calendar=dict(startMonth="2027-01", endMonth="2027-12", workHoursPerFteMonth=160),
    strategy=dict(revenueTarget=12450000, growthTargetPct=0.0, employeeCount=398,
                  enterpriseCustomers=6, operatingCostTarget=12000000,
                  strategicPriorities=["wash-renewal", "health-worker-coverage",
                                       "core-cost-recovery", "reporting-burden"]),
    teams=teams,
    # The rains. Half the districts are unreachable in the wettest months, and the work
    # does not disappear, it piles up for when they are.
    seasonality={MONTHS[0]: 1.12, MONTHS[1]: 1.1, MONTHS[2]: 0.82, MONTHS[3]: 0.7,
                 MONTHS[4]: 0.85, MONTHS[5]: 1.08, MONTHS[6]: 1.15, MONTHS[7]: 1.18,
                 MONTHS[8]: 1.12, MONTHS[9]: 0.88, MONTHS[10]: 0.95, MONTHS[11]: 1.05},
    demandStreams=streams,
    hiringPlan=[
        dict(id="hire-field-14", teamId="team-field", requestMonth="2027-02", headcount=14, leadTimeMonths=4),
        dict(id="hire-me-5", teamId="team-me", requestMonth="2027-03", headcount=5, leadTimeMonths=3),
    ],
    initiatives=initiatives,
    dependencies=[],
    budget=dict(modeledAnnualBudget=12450000),
    funds=funds,
    pooling=dict(clientCount=6, workloadPerClient=4, ahtSeconds=3720, targetSeconds=172800,
                 serviceLevel=0.8, bespokeShare=0.25, contextPenalty=0.3),
    scenarios=[
        dict(id="scenario-base", name="Base plan", type="base",
             description="The 2027 plan as written, with the renewal tranche landing in July."),
        # The run is played on this. Nothing about the work changes; only when the money
        # turns up, which turns out to be enough.
        dict(id="scenario-renewal-late", name="Renewal lands three months late", type="fundingShock",
             delayMonths=3, fundIds=["fund-wash-renewal"],
             description="The second tranche arrives in October rather than July. The same money, later."),
        dict(id="scenario-renewal-lost", name="The renewal is not awarded", type="fundingShock",
             fundMultiplier=0, fundIds=["fund-wash-renewal"],
             description="The bid does not land. Everything it was going to pay for still has to be paid for."),
        dict(id="scenario-core-cut", name="Core funding down 40%", type="fundingShock",
             fundMultiplier=0.6, fundIds=["fund-core"],
             description="The only money that can pay for anything, cut. Watch what stops being possible."),
        dict(id="scenario-donor-squeeze", name="Every funder trims 15%", type="fundingShock",
             fundMultiplier=0.85,
             description="A sector-wide squeeze, applied evenly, which is not how it lands."),
        dict(id="scenario-need-rises", name="Need up 25%", type="demandMultiplier",
             demandMultiplier=1.25,
             description="More people need the service. The grant does not grow to match."),
        dict(id="scenario-turnover", name="Staff turnover up half again", type="attritionMultiplier",
             multiplier=1.5,
             description="Field roles are hard to hold at the best of times."),
        dict(id="scenario-hiring-freeze", name="Recruitment paused", type="hiringFreeze",
             description="Both approved posts are held until the funding position is clear."),
        dict(id="scenario-hard-year", name="Renewal late and need rising", type="combined",
             effects=[dict(type="fundingShock", delayMonths=3, fundIds=["fund-wash-renewal"]),
                      dict(type="demandMultiplier", demandMultiplier=1.25)],
             description="The money is late and more people are at the door."),
    ],
    interventions=[
        dict(id="intervention-automate-reporting", name="Standardise donor reporting",
             type="automation", teamId="team-me", workloadReductionRate=0.25,
             timeToImpactMonths=3, implementationCost=210000,
             description="One reporting pack, mapped to each funder's template. Three months to build, and it comes out of core, which is the money you have least of."),
        dict(id="intervention-expedite-field", name="Bring the field posts forward",
             type="expediteHiring", hiringRequestId="hire-field-14", newLeadTimeMonths=2,
             oneTimeCost=95000,
             description="Recruit locally and shorten induction. Four months becomes two."),
        dict(id="intervention-move-me-to-field", name="Move 5 from Monitoring into Field Delivery",
             type="reallocation", fromTeamId="team-me", toTeamId="team-field",
             headcount=5, timeToImpactMonths=1, implementationCost=40000,
             description="They can do household work within a month. They are not writing the donor reports while they do it, and the reports are a condition of the grant."),
        dict(id="intervention-defer-digital", name="Defer digital case management by 4 months",
             type="defer", initiativeId="init-case-management", months=4,
             description="The one thing here no funder asked for. Push it out."),
        dict(id="intervention-cancel-digital", name="Stop digital case management",
             type="cancel", initiativeId="init-case-management",
             description="Drop it and give Monitoring and Programmes their people back. It was the thing that would have made next year cheaper."),
        dict(id="intervention-half-training", name="Train half the health workers",
             type="rescope", initiativeId="init-chw-training", scopeMultiplier=0.6,
             description="Cover 60% of the cohort. The grant was awarded against the whole one."),
        dict(id="intervention-stretch-water", name="Run the water points leaner and longer",
             type="restaff", initiativeId="init-water-points", durationMultiplier=1.5,
             fteMultiplier=0.7, valueMultiplier=0.92,
             description="A smaller team over a longer run. It finishes after the grant period, which is a conversation with the funder."),
    ],
    decisionWeights=dict(cost=0.35, speed=0.15, revenueExposure=0.5),
    run=dict(
        scenarioId="scenario-renewal-late",
        decisions=[
            dict(id="n1", when="February", monthIndex=1, focusTeamId="team-fundraising",
                 question="Next year is paid for by twelve people no grant will fund.",
                 setup="The WASH renewal bid needs eight of the twelve in Fundraising, plus people from Programmes and Monitoring. Every grant in the building pays for delivery. None of them pays for winning the next one, so all of that comes out of core.",
                 options=[
                     dict(interventionId="intervention-cancel-digital", label="Stop digital case management",
                          price="nothing", why="It is the only thing here no funder asked for, and it is eating the same core money the bid needs."),
                     dict(interventionId="intervention-defer-digital", label="Defer it four months",
                          price="nothing", why="Keep it, later. Whether that helps depends on when the money is actually short."),
                     dict(interventionId=None, label="Run the bid alongside everything else",
                          price="nothing", why="It is five months of work and it is how the organisation exists next year."),
                 ]),
            dict(id="n2", when="April", monthIndex=3, focusTeamId="team-field",
                 question="The rains, and fourteen posts that land in June.",
                 setup="Half the districts are unreachable until May and the work does not disappear while they are, it waits. The posts approved in February arrive in June, which is after the backlog and before the peak.",
                 options=[
                     dict(interventionId="intervention-expedite-field", label="Bring the posts forward",
                          price="$95K", why="Recruit locally and shorten induction. Four months becomes two, paid from core."),
                     dict(interventionId="intervention-stretch-water", label="Run the water points leaner",
                          price="nothing", why="Thirty percent fewer people over half again as long. It finishes after the grant period, which is a conversation with the funder."),
                     dict(interventionId=None, label="Hold the plan", price="nothing",
                          why="The team absorbs the backlog when the roads open."),
                 ]),
            dict(id="n3", when="Mid-year", monthIndex=6, focusTeamId="team-field",
                 question="The tranche has not landed.",
                 setup="The renewal was due in July and is now expected in October. The WASH grant is spent. Field Delivery and Logistics have work, people and a funder, and for three months no money any of them is allowed to draw on.",
                 options=[
                     dict(interventionId="intervention-move-me-to-field", label="Move five from Monitoring into the field",
                          price="$40K", why="They can do household work within a month. They are not writing the donor reports while they do it, and those reports are a condition of the grant."),
                     dict(interventionId="intervention-half-training", label="Train 60% of the cohort",
                          price="nothing", why="Frees people and money on the health side. The grant was awarded against the whole cohort."),
                     dict(interventionId=None, label="Carry on and reconcile later",
                          price="nothing", why="The work continues. The accounts will show what that cost."),
                 ]),
            dict(id="n4", when="September", monthIndex=8, focusTeamId="team-me",
                 question="Monitoring is behind on reporting.",
                 setup="Four funders, four templates, and reporting is a condition of every one of them. Monitoring is also carrying the renewal bid and whatever is left of the digital work.",
                 options=[
                     dict(interventionId="intervention-automate-reporting", label="Standardise the reporting pack",
                          price="$210K", why="One pack mapped to every funder's template. Three months to build, out of core, which is the money you have least of."),
                     dict(interventionId="intervention-cancel-digital", label="Stop digital case management",
                          price="nothing", why="If you have not already. It is the only work here nobody is asking you for."),
                     dict(interventionId=None, label="Hold and catch up", price="nothing",
                          why="The reports go in late. Funders notice."),
                 ]),
            dict(id="n5", when="The last call", monthIndex=10,
                 question="October. The tranche has landed.",
                 setup="Two and a half months of the year left, and money that can only be spent on water and the people who deliver it.",
                 options=[
                     dict(interventionId="intervention-expedite-field", label="Bring the field posts forward",
                          price="$95K", why="If you have not already. There is money for delivery now, if you have people to do it."),
                     dict(interventionId="intervention-move-me-to-field", label="Move five from Monitoring into the field",
                          price="$40K", why="If you have not already. The money is restricted to delivery, and so are they once they move."),
                     dict(interventionId=None, label="Close the year as it stands", price="nothing",
                          why="Spend what can be spent and hand back what cannot."),
                 ]),
        ],
    ),
    demoIntent=dict(
        summary="An organisation that does not own its own money. Income arrives restricted, so it can be short of cash and holding cash at the same time, and the people who win next year's funding are the only ones no funder will pay for.",
        intents=["Restricted money cannot move to where the shortfall is, so unfunded cost and stranded funds rise together.",
                 "Bid writing is the only work that secures next year and the only work with no grant behind it.",
                 "A tranche arriving three months late is the same money and a materially worse year."],
    ),
    routes=[
        dict(id="route-visits-supply", name="Visits that raise a supply request",
             fromStreamId="demand-household-visits", toTeamId="team-logistics",
             share=0.06, handlingMinutesPerUnit=62),
    ],
)
with open("/tmp/ngo.json", "w") as f: json.dump(model, f, indent=2)
print("ngo skeleton:", len(teams), "teams,", len(funds), "funds, cost/yr $%.2fM" %
      (sum(t["currentFte"]*t["monthlyFteCost"]*12 for t in teams)/1e6),
      "| funds $%.2fM" % (sum(f["amount"] for f in funds)/1e6))
