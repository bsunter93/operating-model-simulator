"""Northgate Studio: a client services firm, where almost all the work is projects.

The opposite pole from a health service. Queues are small, nearly everything is an
engagement with a client's name on it, hiring is fast, and the constraint is not a
machine but a small number of senior people every engagement wants. Utilisation targets
are high on purpose, because bench time is the thing that kills a firm like this, which
also means there is nothing spare when a client moves a date.
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
    team("team-strategy", "Strategy and Planning", "portfolio-only", 14, 0.16, 0.14, 0.82, 11500, 0.8),
    team("team-design", "Design Studio", "portfolio-and-run", 38, 0.18, 0.15, 0.85, 8200, 0.9, 0.9),
    team("team-engineering", "Engineering", "portfolio-and-run", 52, 0.17, 0.15, 0.85, 9400, 0.9, 0.9),
    team("team-delivery", "Delivery Management", "portfolio-only", 18, 0.14, 0.16, 0.8, 8800, 0.7),
    team("team-client-support", "Client Support", "operational", 12, 0.2, 0.18, 0.75, 5600, 0.9, 0.8),
    team("team-data", "Data and Insight", "portfolio-and-run", 18, 0.16, 0.15, 0.82, 9000, 0.8, 0.9),
]

streams = [
    dict(id="demand-support-tickets", name="Client support tickets", teamId="team-client-support",
         unit="tickets", annualVolume=24000, handlingMinutesPerUnit=24, complexityFactor=1.0,
         workMix=dict(reusable=0.6, configurable=0.3, bespoke=0.1), seasonality="default",
         answerWithinSeconds=7200),
    dict(id="demand-change-requests", name="Small change requests", teamId="team-engineering",
         unit="requests", annualVolume=4200, handlingMinutesPerUnit=190, complexityFactor=1.0,
         workMix=dict(reusable=0.45, configurable=0.35, bespoke=0.2), seasonality="default",
         answerWithinSeconds=172800),
    dict(id="demand-design-asks", name="Retainer design requests", teamId="team-design",
         unit="requests", annualVolume=3100, handlingMinutesPerUnit=210, complexityFactor=1.0,
         workMix=dict(reusable=0.4, configurable=0.35, bespoke=0.25), seasonality="default"),
    dict(id="demand-reporting", name="Client reporting and dashboards", teamId="team-data",
         unit="reports", annualVolume=1800, handlingMinutesPerUnit=240, complexityFactor=1.0,
         workMix=dict(reusable=0.5, configurable=0.35, bespoke=0.15), seasonality="default"),
]

# Engagements, not programmes. Each has a client's name on it and a contract behind it.
initiatives = [
    dict(id="init-brightline", name="Brightline rebrand", startMonth="2027-01", durationMonths=7,
         requiredFteByTeam={"team-strategy": 5, "team-design": 16, "team-delivery": 3},
         strategicValue=8, financialValue=2900000, urgency=8, confidence=0.8,
         revenueAtRisk=2900000, executionFailureProbability=0.15, discretionary=False),
    dict(id="init-meridian", name="Meridian commerce replatform", startMonth="2027-02", durationMonths=10,
         requiredFteByTeam={"team-engineering": 23, "team-design": 8, "team-delivery": 5, "team-data": 4},
         strategicValue=10, financialValue=7400000, urgency=10, confidence=0.7,
         revenueAtRisk=7400000, executionFailureProbability=0.28, discretionary=False),
    dict(id="init-framework-bid", name="Public framework bid", startMonth="2027-03", durationMonths=5,
         requiredFteByTeam={"team-strategy": 6, "team-delivery": 4, "team-data": 3},
         strategicValue=9, financialValue=5200000, urgency=9, confidence=0.45,
         revenueAtRisk=5200000, executionFailureProbability=0.45, discretionary=False),
    dict(id="init-design-system", name="Our own design system", startMonth="2027-04", durationMonths=8,
         requiredFteByTeam={"team-design": 6, "team-engineering": 5},
         strategicValue=6, financialValue=1100000, urgency=4, confidence=0.85,
         revenueAtRisk=0, executionFailureProbability=0.12, discretionary=True),
]

model = collections.OrderedDict(
    modelVersion="3.0", id="northgate-studio-2027", name="Northgate Studio",
    status="calibrated", currency="EUR", locale="en-IE",
    lexicon=dict(revenueNoun="Fee income", customerNoun="The client"),
    calendar=dict(startMonth="2027-01", endMonth="2027-12", workHoursPerFteMonth=160),
    strategy=dict(revenueTarget=27000000, growthTargetPct=0.18, employeeCount=175,
                  enterpriseCustomers=34, operatingCostTarget=21000000,
                  strategicPriorities=["meridian-delivery", "framework-win",
                                       "retainer-growth", "senior-bench"]),
    teams=teams,
    # August empties out and December is short. Both are when clients want things finished.
    seasonality={MONTHS[0]: 0.95, MONTHS[1]: 1.05, MONTHS[2]: 1.1, MONTHS[3]: 1.08,
                 MONTHS[4]: 1.05, MONTHS[5]: 1.1, MONTHS[6]: 1.0, MONTHS[7]: 0.72,
                 MONTHS[8]: 1.08, MONTHS[9]: 1.12, MONTHS[10]: 1.05, MONTHS[11]: 0.7},
    demandStreams=streams,
    hiringPlan=[
        dict(id="hire-engineering-9", teamId="team-engineering", requestMonth="2027-02",
             headcount=9, leadTimeMonths=3),
        dict(id="hire-design-5", teamId="team-design", requestMonth="2027-03",
             headcount=5, leadTimeMonths=2),
    ],
    initiatives=initiatives,
    # No dependency between them on purpose. The internal system does not block the
    # client work; it competes with it for the same designers, and loses every time
    # somebody has to choose. That is the thing worth showing.
    dependencies=[],
    budget=dict(modeledAnnualBudget=16800000),
    pooling=dict(clientCount=34, workloadPerClient=1, ahtSeconds=1440, targetSeconds=7200,
                 serviceLevel=0.8, bespokeShare=0.35, contextPenalty=0.45),
    scenarios=[
        dict(id="scenario-base", name="Base plan", type="base",
             description="The 2027 plan as written, with both hiring requests."),
        # The run is played on this. Winning work and losing the people to do it is the
        # squeeze this kind of firm actually dies of.
        dict(id="scenario-squeeze", name="New business won, seniors leaving", type="combined",
             effects=[dict(type="demandMultiplier", demandMultiplier=1.2, fromMonth="2027-03"),
                      dict(type="attritionMultiplier", multiplier=2.2, teamIds=["team-design"])],
             description="Retainers grow 20% from March, and designers leave at over twice the planned rate all year."),
        dict(id="scenario-new-business", name="Retainers +25%", type="demandMultiplier",
             demandMultiplier=1.25, fromMonth="2027-03",
             description="A good year on the retainer book, which is a capacity problem wearing a nice hat."),
        dict(id="scenario-designers-poached", name="Designers poached", type="attritionMultiplier",
             multiplier=2.5, teamIds=["team-design"],
             description="One team loses people at two and a half times the planned rate and no other team is touched."),
        dict(id="scenario-client-leaves", name="A client leaves in June", type="demandMultiplier",
             demandMultiplier=0.8, fromMonth="2027-06",
             description="Retainer work drops a fifth from June. The bench is now the problem."),
        dict(id="scenario-hiring-freeze", name="Hiring freeze", type="hiringFreeze",
             description="Both requests are withdrawn. Nobody already here leaves because of it."),
        dict(id="scenario-margin-pressure", name="Margin pressure", type="budgetConstraint",
             budgetMultiplier=0.9,
             description="The cost base has to come in 10% under plan."),
        dict(id="scenario-tooling", name="Tooling saves 12%", type="productivityMultiplier",
             multiplier=1.12, description="The same work takes 12% fewer hours everywhere."),
        dict(id="scenario-delivery-risk", name="Delivery risk +60%", type="failureProbabilityMultiplier",
             multiplier=1.6, description="Every engagement is markedly likelier to miss."),
        dict(id="scenario-hard-year", name="Squeeze with a hiring freeze", type="combined",
             effects=[dict(type="demandMultiplier", demandMultiplier=1.2, fromMonth="2027-03"),
                      dict(type="attritionMultiplier", multiplier=2.2, teamIds=["team-design"]),
                      dict(type="hiringFreeze")],
             description="Growing, losing people, and not allowed to replace them."),
    ],
    interventions=[
        dict(id="intervention-freelance-design", name="Put 22% of design production with freelancers",
             type="automation", teamId="team-design", workloadReductionRate=0.22,
             timeToImpactMonths=1, implementationCost=880000,
             description="A trusted freelance bench takes the production work. Available within the month, and it costs roughly what the people would have."),
        dict(id="intervention-expedite-design", name="Bring the design hires forward",
             type="expediteHiring", hiringRequestId="hire-design-5", newLeadTimeMonths=1,
             oneTimeCost=140000,
             description="Search fees and buying out notice periods. Two months becomes one."),
        dict(id="intervention-move-eng-to-design", name="Move 6 front-end engineers into design production",
             type="reallocation", fromTeamId="team-engineering", toTeamId="team-design",
             headcount=6, timeToImpactMonths=1, implementationCost=120000,
             description="They can do production design inside a month. They are not doing Meridian while they do it."),
        dict(id="intervention-drop-design-system", name="Stop building our own design system",
             type="cancel", initiativeId="init-design-system",
             description="The internal investment. Nothing bills against it, and eleven people come back."),
        dict(id="intervention-half-brightline", name="Take Brightline to 60% of scope",
             type="rescope", initiativeId="init-brightline", scopeMultiplier=0.6,
             description="The identity and the core applications, not the long tail. A conversation with the client, and less of the fee."),
        dict(id="intervention-stretch-meridian", name="Run Meridian leaner and longer",
             type="restaff", initiativeId="init-meridian", durationMultiplier=1.4, fteMultiplier=0.72,
             valueMultiplier=0.94,
             description="A smaller team over a longer run. It lands later, and the client has an opinion about that."),
        dict(id="intervention-defer-framework", name="Defer the framework bid by 2 months",
             type="defer", initiativeId="init-framework-bid", months=2,
             description="Push the bid out and give Strategy some air. Bids have dates, so check what this actually costs."),
    ],
    decisionWeights=dict(cost=0.2, speed=0.3, revenueExposure=0.5),
    run=dict(
        scenarioId="scenario-squeeze",
        decisions=[
            dict(id="a1", when="February", monthIndex=1, focusTeamId="team-design",
                 question="The Design Studio cannot hold both engagements.",
                 setup="Brightline and Meridian both staff out of the same thirty-eight people, and the studio is also carrying the retainer book and an internal design system nobody bills for.",
                 options=[
                     dict(interventionId="intervention-freelance-design", label="Put production with freelancers",
                          price="€880K", why="A trusted bench takes 22% of the work inside a month, and costs roughly what the people would have."),
                     dict(interventionId="intervention-drop-design-system", label="Stop the internal design system",
                          price="nothing", why="Eleven people come back to billable work. The thing that was going to make next year cheaper does not happen."),
                     dict(interventionId=None, label="Hold and run hot", price="nothing",
                          why="The studio absorbs it, as studios do, right up until people start leaving."),
                 ]),
            dict(id="a2", when="March", monthIndex=2, focusTeamId="team-design",
                 question="Two senior designers have resigned this month.",
                 setup="Five design hires were approved in March at a two-month lead time. Seniority is not a number of people; the work they were holding does not redistribute evenly.",
                 options=[
                     dict(interventionId="intervention-expedite-design", label="Bring the hires forward",
                          price="€140K", why="Search fees and bought-out notice. Two months becomes one."),
                     dict(interventionId="intervention-move-eng-to-design", label="Move six engineers into production",
                          price="€120K", why="They can do production design inside a month. They are not doing Meridian while they do it."),
                     dict(interventionId=None, label="Backfill in the normal way", price="nothing",
                          why="The hires land in May and the studio covers until then."),
                 ]),
            dict(id="a3", when="Mid-year", monthIndex=5, focusTeamId="team-strategy",
                 question="The framework bid and Brightline want the same fourteen people.",
                 setup="Strategy is fourteen people. The bid is worth more than Brightline and is under half as likely to land.",
                 options=[
                     dict(interventionId="intervention-defer-framework", label="Defer the bid two months",
                          price="nothing", why="Give Strategy some air. Bids have submission dates, so check whether this changes the number at all."),
                     dict(interventionId="intervention-half-brightline", label="Take Brightline to 60%",
                          price="nothing", why="The identity and the core applications, not the long tail. Less work and less fee."),
                     dict(interventionId=None, label="Run both at full scope", price="nothing",
                          why="Everyone stays busy and something gives in August."),
                 ]),
            dict(id="a4", when="September", monthIndex=8, focusTeamId="team-engineering",
                 question="Meridian is the year, and it is tight.",
                 setup="Twenty-three engineers on one client, against a book that grew 20% in March. Whatever else happens, this one has the biggest number attached to it.",
                 options=[
                     dict(interventionId="intervention-stretch-meridian", label="Run Meridian leaner and longer",
                          price="nothing", why="A smaller team over a longer run. It lands later, and the client has an opinion about that."),
                     dict(interventionId="intervention-move-eng-to-design", label="Move six engineers into production",
                          price="€120K", why="If you have not already. It takes them off Meridian."),
                     dict(interventionId=None, label="Hold the staffing", price="nothing",
                          why="Meridian keeps its team and everything else works around it."),
                 ]),
            dict(id="a5", when="The last call", monthIndex=10,
                 question="One more before the year closes.",
                 setup="October. Whatever you have not spent is still there, and December is short.",
                 options=[
                     dict(interventionId="intervention-freelance-design", label="Put production with freelancers",
                          price="€880K", why="If you have not already. A month to mobilise means it is working for November and December."),
                     dict(interventionId="intervention-drop-design-system", label="Stop the internal design system",
                          price="nothing", why="If you have not already. It is the only thing here nobody is paying for."),
                     dict(interventionId=None, label="Take the year as it stands", price="nothing",
                          why="Change nothing else."),
                 ]),
        ],
    ),
    demoIntent=dict(
        summary="A client services firm where the constraint is a named group of senior people, the internal investment always loses to billable work, and winning new business is itself a capacity problem.",
        intents=["Design is the constraint and it is seniority, not headcount.",
                 "The internal design system is the only work nobody is paying for, which makes it the easy cut and the expensive one.",
                 "Moving engineers into design helps the studio and takes them off the largest contract in the building."],
    ),
    routes=[
        dict(id="route-support-escalations", name="Support tickets that become engineering work",
             fromStreamId="demand-support-tickets", toTeamId="team-engineering",
             share=0.08, handlingMinutesPerUnit=95),
    ],
)
with open("/tmp/agency.json", "w") as f: json.dump(model, f, indent=2)
print("agency skeleton:", len(teams), "teams,", len(streams), "streams,", len(initiatives), "engagements")
