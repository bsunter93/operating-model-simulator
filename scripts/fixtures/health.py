"""Meadowbrook Health Partnership: a community health service, not a software company.

Deliberately unlike Atlas in the ways that matter. Shrinkage is far higher, because travel
time, mandatory training and sickness are real here and a developer's calendar is not.
Hiring takes six months because posts are advertised, interviewed and cleared. The
bottleneck is a physical one: scanners and the people who run them.
"""
import json, collections

M = 12
MONTHS = [f"2027-{m:02d}" for m in range(1, 13)]

def team(i, name, kind, fte, attr, shrink, target, cost, burnout=None, carry=None):
    t = collections.OrderedDict(id=i, name=name, teamType=kind, currentFte=fte,
        annualAttrition=attr, shrinkage=shrink, targetUtilization=target, monthlyFteCost=cost)
    if burnout is not None: t["burnoutSensitivity"] = burnout
    if carry is not None: t["backlog"] = {"carryForward": carry}
    return t

teams = [
    team("team-referral-hub", "Referral Hub", "operational", 48, 0.14, 0.22, 0.80, 3800, 0.9, 0.9),
    team("team-outpatient", "Outpatient Clinics", "operational", 180, 0.12, 0.25, 0.82, 5200, 0.9, 0.95),
    team("team-diagnostics", "Diagnostics", "operational", 60, 0.14, 0.20, 0.78, 5600, 0.9, 0.95),
    team("team-community-nursing", "Community Nursing", "operational", 95, 0.16, 0.28, 0.80, 4300, 0.9, 0.9),
    team("team-digital-records", "Digital and Records", "portfolio-and-run", 28, 0.15, 0.18, 0.80, 5900, 0.6, 0.95),
    team("team-improvement", "Service Improvement", "portfolio-only", 17, 0.12, 0.15, 0.85, 5400, 0.5, 0.9),
]

streams = [
    dict(id="demand-gp-referrals", name="GP referrals", teamId="team-referral-hub", unit="referrals",
         annualVolume=300000, handlingMinutesPerUnit=9, complexityFactor=1.0,
         workMix=dict(reusable=0.7, configurable=0.22, bespoke=0.08), seasonality="default",
         answerWithinSeconds=14400),
    dict(id="demand-appointments", name="Outpatient appointments", teamId="team-outpatient", unit="appointments",
         annualVolume=580000, handlingMinutesPerUnit=18, complexityFactor=1.0,
         workMix=dict(reusable=0.6, configurable=0.28, bespoke=0.12), seasonality="default"),
    dict(id="demand-imaging", name="Imaging and test requests", teamId="team-diagnostics", unit="requests",
         annualVolume=262000, handlingMinutesPerUnit=16, complexityFactor=1.0,
         workMix=dict(reusable=0.65, configurable=0.25, bespoke=0.1), seasonality="default",
         answerWithinSeconds=172800),
    dict(id="demand-community-visits", name="Community visits", teamId="team-community-nursing", unit="visits",
         annualVolume=205000, handlingMinutesPerUnit=26, complexityFactor=1.0,
         workMix=dict(reusable=0.55, configurable=0.3, bespoke=0.15), seasonality="default"),
    dict(id="demand-records", name="Records and coding requests", teamId="team-digital-records", unit="requests",
         annualVolume=72000, handlingMinutesPerUnit=11, complexityFactor=1.0,
         workMix=dict(reusable=0.75, configurable=0.2, bespoke=0.05), seasonality="default",
         answerWithinSeconds=86400),
]

initiatives = [
    dict(id="init-shared-record", name="Shared Care Record rollout", startMonth="2027-01", durationMonths=7,
         requiredFteByTeam={"team-digital-records": 12, "team-outpatient": 6, "team-referral-hub": 2},
         strategicValue=9, financialValue=4200000, urgency=8, confidence=0.75,
         revenueAtRisk=3100000, executionFailureProbability=0.22, discretionary=False),
    dict(id="init-diagnostic-hub", name="Community Diagnostic Hub", startMonth="2027-04", durationMonths=8,
         requiredFteByTeam={"team-diagnostics": 6, "team-improvement": 6, "team-digital-records": 3},
         strategicValue=10, financialValue=6800000, urgency=9, confidence=0.7,
         revenueAtRisk=5400000, executionFailureProbability=0.25, discretionary=False),
    dict(id="init-waiting-list", name="Waiting List Recovery", startMonth="2027-02", durationMonths=9,
         requiredFteByTeam={"team-outpatient": 14, "team-improvement": 5},
         strategicValue=8, financialValue=3600000, urgency=10, confidence=0.8,
         revenueAtRisk=3600000, executionFailureProbability=0.18, discretionary=False),
    dict(id="init-discharge-pathway", name="Discharge to Assess", startMonth="2027-03", durationMonths=7,
         requiredFteByTeam={"team-community-nursing": 10, "team-improvement": 4},
         strategicValue=7, financialValue=2400000, urgency=7, confidence=0.72,
         revenueAtRisk=1900000, executionFailureProbability=0.2, discretionary=True),
]

model = collections.OrderedDict(
    modelVersion="3.0", id="meadowbrook-health-2027", name="Meadowbrook Health Partnership",
    status="calibrated", currency="GBP", locale="en-GB",
    lexicon=dict(revenueNoun="Funding", customerNoun="The patient"),
    calendar=dict(startMonth="2027-01", endMonth="2027-12", workHoursPerFteMonth=160),
    strategy=dict(revenueTarget=31000000, growthTargetPct=0.04, employeeCount=520,
                  enterpriseCustomers=140, operatingCostTarget=28000000,
                  strategicPriorities=["waiting-list-recovery", "shared-care-record",
                                       "diagnostic-capacity", "discharge-flow"]),
    teams=teams,
    # Referrals and visits do not stop for summer the way a sales quarter does; winter is
    # the peak, and the dip is August when clinics run reduced lists.
    seasonality={MONTHS[0]: 1.12, MONTHS[1]: 1.08, MONTHS[2]: 1.05, MONTHS[3]: 1.0,
                 MONTHS[4]: 0.97, MONTHS[5]: 0.94, MONTHS[6]: 0.9, MONTHS[7]: 0.85,
                 MONTHS[8]: 0.98, MONTHS[9]: 1.04, MONTHS[10]: 1.08, MONTHS[11]: 0.99},
    demandStreams=streams,
    hiringPlan=[
        dict(id="hire-diagnostics-12", teamId="team-diagnostics", requestMonth="2027-01",
             headcount=12, leadTimeMonths=9),
        dict(id="hire-community-8", teamId="team-community-nursing", requestMonth="2027-02",
             headcount=8, leadTimeMonths=4),
    ],
    initiatives=initiatives,
    dependencies=[dict(id="dep-hub-record", predecessorId="init-shared-record",
                       successorId="init-diagnostic-hub", lagMonths=1)],
    budget=dict(modeledAnnualBudget=26000000),
    pooling=dict(clientCount=8, workloadPerClient=3, ahtSeconds=540, targetSeconds=14400,
                 serviceLevel=0.85, bespokeShare=0.12, contextPenalty=0.25),
    scenarios=[
        dict(id="scenario-base", name="Base plan", type="base",
             description="The 2027 plan as written, including the radiography and community nursing posts."),
        # The run is played on this one. Winter is when a health service is tested, and the
        # radiographers approved in January do not arrive until July.
        dict(id="scenario-winter-surge", name="Winter surge +28% from September", type="demandMultiplier",
             demandMultiplier=1.28, fromMonth="2027-09",
             description="Demand steps up 28% in September and stays up through the winter."),
        dict(id="scenario-referral-growth", name="Referrals +12%", type="demandMultiplier",
             demandMultiplier=1.12,
             description="Every stream runs 12% above plan for the whole year."),
        dict(id="scenario-recruitment-freeze", name="Recruitment freeze", type="hiringFreeze",
             description="Every approved post is withdrawn. Nobody already in post leaves because of it."),
        dict(id="scenario-funding-cut", name="Funding -8%", type="budgetConstraint", budgetMultiplier=0.92,
             description="The modelled budget drops to 92% of plan."),
        dict(id="scenario-record-benefit", name="Shared record saves 8%", type="productivityMultiplier",
             multiplier=1.08,
             description="The same work takes 8% fewer hours once the record is live everywhere."),
        dict(id="scenario-sickness", name="Sickness and turnover up", type="attritionMultiplier", multiplier=1.5,
             description="Staff leave half again as fast as planned, across every team."),
        dict(id="scenario-radiography-gap", name="Diagnostics cannot recruit", type="attritionMultiplier",
             multiplier=2.5, teamIds=["team-diagnostics"],
             description="A national shortage of radiographers hits one team and no other."),
        dict(id="scenario-delivery-risk", name="Delivery risk +50%", type="failureProbabilityMultiplier",
             multiplier=1.5,
             description="Every programme is half again as likely to miss."),
        dict(id="scenario-mild-winter", name="Mild winter, demand -8%", type="demandMultiplier",
             demandMultiplier=0.92, fromMonth="2027-10",
             description="The winter that does not come. Worth seeing, because the plan still has to hold."),
        dict(id="scenario-hard-year", name="Winter surge with a recruitment freeze", type="combined",
             effects=[dict(type="demandMultiplier", demandMultiplier=1.28, fromMonth="2027-09"),
                      dict(type="hiringFreeze")],
             description="Both at once, which is how it usually arrives."),
    ],
    interventions=[
        dict(id="intervention-outsource-imaging", name="Send 18% of imaging to an independent provider",
             type="automation", teamId="team-diagnostics", workloadReductionRate=0.18,
             timeToImpactMonths=2, implementationCost=1450000,
             description="A contract takes routine scans off the department. Two months to mobilise, and it is paid for whether or not the winter comes."),
        dict(id="intervention-bank-radiographers", name="Bring the radiography posts forward",
             type="expediteHiring", hiringRequestId="hire-diagnostics-12", newLeadTimeMonths=3,
             oneTimeCost=310000,
             description="Agency and bank cover while the substantive posts are filled. Nine months becomes three, at a premium."),
        dict(id="intervention-move-to-clinics", name="Move 8 nurses to outpatient clinics",
             type="reallocation", fromTeamId="team-community-nursing", toTeamId="team-outpatient",
             headcount=8, timeToImpactMonths=1, implementationCost=96000,
             description="They can run clinics within the month. The visits they were doing do not stop existing."),
        dict(id="intervention-defer-hub", name="Defer the Diagnostic Hub by 3 months",
             type="defer", initiativeId="init-diagnostic-hub", months=3,
             description="Push the start out and give three teams some air."),
        dict(id="intervention-cancel-discharge", name="Stop the Discharge to Assess pathway",
             type="cancel", initiativeId="init-discharge-pathway",
             description="Drop it for this year and give Community Nursing its people back. You lose what it was going to save."),
        dict(id="intervention-half-waiting-list", name="Half the Waiting List Recovery",
             type="rescope", initiativeId="init-waiting-list", scopeMultiplier=0.5,
             description="Treat the longest waits only. Half the people on it, half the backlog cleared."),
        dict(id="intervention-slow-record", name="Roll the Shared Care Record out slower",
             type="restaff", initiativeId="init-shared-record", durationMultiplier=1.6, fteMultiplier=0.65,
             valueMultiplier=0.95,
             description="A third fewer people on it, running well over half again as long. It lands later and everything downstream of it moves too."),
    ],
    decisionWeights=dict(cost=0.3, speed=0.2, revenueExposure=0.5),
    run=dict(
        scenarioId="scenario-winter-surge",
        decisions=[
            dict(id="h1", when="January", monthIndex=0, focusTeamId="team-diagnostics",
                 question="Diagnostics will not hold the winter.",
                 setup="Twelve radiography posts were approved this month. Advert, shortlist, interview, references, clearance and notice take nine months, so they are in post in October, a month into the surge they were approved for.",
                 options=[
                     dict(interventionId="intervention-bank-radiographers", label="Bring the posts forward",
                          price="£310K", why="Bank and agency cover while the substantive posts are filled. Nine months becomes three, at a premium."),
                     dict(interventionId="intervention-outsource-imaging", label="Send routine scans out",
                          price="£1.45M", why="An independent provider takes 18% of imaging. Two months to mobilise, and it is paid for whether or not the winter comes."),
                     dict(interventionId=None, label="Hold the posts as planned", price="nothing",
                          why="They arrive in July and the department runs hot until then."),
                 ]),
            dict(id="h2", when="February", monthIndex=1, focusTeamId="team-improvement",
                 question="Three programmes are drawing on the same seventeen improvement staff.",
                 setup="The Diagnostic Hub, the Waiting List Recovery and Discharge to Assess were each planned as though the others were not happening.",
                 options=[
                     dict(interventionId="intervention-defer-hub", label="Defer the Diagnostic Hub",
                          price="nothing", why="Three months later. It was already waiting on the record rollout, so check whether this changes anything at all."),
                     dict(interventionId="intervention-half-waiting-list", label="Treat the longest waits only",
                          price="nothing", why="Half the people on the recovery programme, and half the backlog cleared."),
                     dict(interventionId=None, label="Leave all three as planned", price="nothing",
                          why="Everyone stays busy and the improvement team finds out in September."),
                 ]),
            dict(id="h3", when="Mid-year", monthIndex=5, focusTeamId="team-outpatient",
                 question="The longest waits are in outpatients.",
                 setup="A hundred and eighty people run the clinics, and the Waiting List Recovery is staffed out of the same rota that sees the patients.",
                 options=[
                     dict(interventionId="intervention-move-to-clinics", label="Move eight nurses into clinics",
                          price="£96K", why="Cross-training and backfill. They can run clinics within the month. The home visits they were doing do not stop existing."),
                     dict(interventionId="intervention-cancel-discharge", label="Stop Discharge to Assess",
                          price="nothing", why="Gives Community Nursing ten people back. You lose what the pathway was going to save."),
                     dict(interventionId=None, label="Keep the plan as written", price="nothing",
                          why="The waits are what they are."),
                 ]),
            dict(id="h4", when="September", monthIndex=8, focusTeamId="team-digital-records",
                 question="One more call before the winter lands.",
                 setup="The Shared Care Record is the thing everything else is sequenced behind, and Digital and Records is carrying it alongside the coding queue.",
                 options=[
                     dict(interventionId="intervention-slow-record", label="Roll the record out slower",
                          price="nothing", why="A third fewer people on it, running well over half again as long. It lands later, and so does everything behind it."),
                     dict(interventionId="intervention-defer-hub", label="Defer the Diagnostic Hub",
                          price="nothing", why="If you have not already. The hub is the thing waiting on the record."),
                     dict(interventionId=None, label="Hold the sequence", price="nothing",
                          why="The record lands when it lands."),
                 ]),
            dict(id="h5", when="The last call", monthIndex=10,
                 question="October, and the referrals are climbing.",
                 setup="Whatever you have not spent is still available, and there are eight weeks before the peak.",
                 options=[
                     dict(interventionId="intervention-outsource-imaging", label="Send routine scans out",
                          price="£1.45M", why="If you have not already. Two months to mobilise means it is live for December and not for November."),
                     dict(interventionId="intervention-move-to-clinics", label="Move eight nurses into clinics",
                          price="£96K", why="If you have not already. It helps the clinics and it costs the community."),
                     dict(interventionId=None, label="Take the winter as it comes", price="nothing",
                          why="Change nothing else and hold what you have."),
                 ]),
        ],
    ),
    demoIntent=dict(
        summary="A community health service whose bottleneck is physical, whose hiring takes six months, and whose every fix takes something from another service.",
        intents=["Diagnostics is the constraint and cannot be hired out of inside a winter.",
                 "The Diagnostic Hub is sequenced behind a record rollout nobody linked it to.",
                 "Moving nurses into clinics is not free: the visits they were doing do not stop existing."],
    ),
    routes=[
        # A referral that turns out to need a scan lands on Diagnostics, whether or not
        # anybody planned for it there.
        dict(id="route-referral-imaging", name="Referrals that generate an imaging request",
             fromStreamId="demand-gp-referrals", toTeamId="team-diagnostics",
             share=0.05, handlingMinutesPerUnit=16),
    ],
)

with open("/tmp/health.json", "w") as f:
    json.dump(model, f, indent=2)
print("teams", len(teams), "streams", len(streams), "initiatives", len(initiatives))
