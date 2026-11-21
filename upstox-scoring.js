"use strict";

// An automatic available-data screen, distinct from the complete analyst model.
// Never relabel current ratios as historical medians or PBT as operating profit.
const NJAutoScore = (() => {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const n = (v) => typeof v === "string" ? NJScoring.numeric(v.trim().replace(/%$/, "")) : NJScoring.numeric(v);
  const key = (p) => { const m=/^(\w{3}) (\d{4})$/.exec(p||""); return m && months.includes(m[1]) ? Number(m[2])*12+months.indexOf(m[1]) : null; };
  const dates = (r) => (r?.history||[]).map((h)=>h.period).filter((p)=>key(p)!==null).sort((a,b)=>key(b)-key(a));
  const at = (r,p) => n(r?.history?.find((h)=>h.period===p)?.value);
  const row = (data,label) => data?.full_statement?.find((r)=>r.particular?.toLowerCase()===label.toLowerCase());
  const median = (a) => {const v=[...a].sort((a,b)=>a-b);return v.length%2?v[Math.floor(v.length/2)]:(v[v.length/2-1]+v[v.length/2])/2;};
  // Confirmed exchange action, not an inferred adjustment. Provider FY2025/FY2026
  // EPS is already restated, while FY2023/FY2024 in observed responses is not.
  const actions = {BAJFINANCE:{factor:10,after:2025*12+5,source:"https://nsearchives.nseindia.com/content/circulars/FAOP68547.pdf"}};
  function evaluate(stock,payload,now=Date.now()/1000) {
    const model=NJScoring.modelFor(stock), p=NJScoring.profiles[model], sections=payload?.sections||{};
    const income=sections.income?.data, balance=sections.balance?.data, flow=sections.cash?.data;
    const ratios=Array.isArray(sections.ratios?.data)?sections.ratios.data:[];
    const annual=income?.time_period==="yearly" && income?.type==="consolidated";
    const ratio=(name)=>n(ratios.find((r)=>r.name===name)?.company_value);
    const known={};
    const adjustments=[];
    const patRow=annual?row(income,"Profit After Tax"):null;
    const rawEPS=annual?row(income,"EPS - Diluted"):null;
    const epsRow=rawEPS?{...rawEPS,history:rawEPS.history.map((h)=>({...h}))}:null;
    const latestEPSPeriod=dates(epsRow)[0];
    const latestShares=at(patRow,latestEPSPeriod)>0 && at(epsRow,latestEPSPeriod)>0 ? at(patRow,latestEPSPeriod)/at(epsRow,latestEPSPeriod):null;
    const action=actions[stock.symbol];
    if(action && key(latestEPSPeriod)>action.after && latestShares>0){
      for(const h of epsRow.history){
        const profit=at(patRow,h.period), eps=n(h.value);
        const relative=profit>0&&eps>0?latestShares/(profit/eps):null;
        if(key(h.period)<action.after && relative>action.factor*.7 && relative<action.factor*1.4){
          h.value=eps/action.factor;
          adjustments.push(`${h.period} EPS divided by ${action.factor} for the confirmed 2:1 split and 4:1 bonus. Already-restated years left unchanged. Source: ${action.source}`);
        }
      }
    }
    const epsDates=dates(epsRow);
    const unresolvedEPS=epsDates.some((d,i)=>{
      if(!i)return false;
      const previous=epsDates[i-1], ep=at(epsRow,previous), eb=at(epsRow,d), pp=at(patRow,previous), pb=at(patRow,d);
      if(!(ep>0&&eb>0&&pp>0&&pb>0))return false;
      const change=(pp/ep)/(pb/eb);
      return change>2||change<.5;
    });
    function put(id,value,section,detail,period=null) {
      const source=sections[section], age=source?.fetched_at ? now-source.fetched_at : Infinity;
      let reason=value===null || !Number.isFinite(value) ? "Not supplied or not derivable from this response" : age < -300 ? "Download timestamp is in the future" : age>7*86400 ? "Download is older than 7 days; refresh needed" : "";
      if(period && key(period)!==null) {
        const reportDate=Date.UTC(Math.floor(key(period)/12),key(period)%12+1,0)/1000;
        if(now-reportDate>550*86400) reason="Financial reporting period is too old";
        if(reportDate>now+86400) reason="Reporting period is in the future";
      }
      known[id]={value:reason?null:value,reason,source:`Upstox ${section}`,detail,period,fetched_at:source?.fetched_at};
    }
    for (const [id,name] of Object.entries({roce:"ROCE",roe:"ROE",roa:"ROA",pe:"P/E",ev:"EV/EBITDA",pb:"P/B",quick:"Quick Ratio",npa:"Net NPA",nim:"NIM",casa:"CASA"}))
      put(id,ratio(name),"ratios",`Provider-reported ${name}. Financial basis and effective valuation/reporting date are not supplied; download time is shown separately.`);
    for(const id of ["pe","ev","pb"]) if(known[id].value!==null && known[id].value<=0)known[id]={...known[id],value:null,reason:"Positive earnings/book value and multiple required"};
    for(const id of ["npa","casa"]) if(known[id].value!==null && (known[id].value<0||known[id].value>100))known[id]={...known[id],value:null,reason:"Provider percentage outside 0–100"};
    if(known.quick.value!==null && known.quick.value<0)known.quick={...known.quick,value:null,reason:"Quick ratio cannot be negative"};
    function cagr(id,label) {
      const r=id==="eps"?epsRow:annual?row(income,label):null, latest=dates(r)[0], base=dates(r).find((d)=>key(latest)-key(d)===36);
      const end=at(r,latest), start=at(r,base);
      put(id,end>0&&start>0 ? 100*(Math.pow(end/start,1/3)-1):null,"income",`${label}: ${base||"missing base"} to ${latest||"missing latest"}. Provider history; merger and corporate-action comparability is not independently verified.`,latest);
    }
    cagr("sales","Revenue");cagr("eps","EPS - Diluted");cagr("patgrowth","Profit After Tax");
    if(adjustments.length)known.eps.detail += " " + adjustments.join(" ");
    if(unresolvedEPS)known.eps={...known.eps,value:null,reason:"EPS / PAT history suggests a share-basis discontinuity; corporate-action review required"};
    const useParent=stock.symbol==="M&M" && sections.parent_income?.data?.type==="standalone" && sections.parent_cash?.data?.type==="standalone";
    const cashIncome=useParent?sections.parent_income.data:income, cashFlow=useParent?sections.parent_cash.data:flow;
    const pat=cashIncome?.time_period==="yearly"?row(cashIncome,"Profit After Tax"):null;
    const cashrow=cashFlow?.cash_flow?.find((r)=>r.category==="operating");
    const latest=dates(pat)[0], last3=[0,12,24].map((offset)=>dates(pat).find((d)=>key(latest)-key(d)===offset));
    const matched=cashIncome?.time_period==="yearly" && cashIncome?.type===cashFlow?.type && cashFlow?.time_period==="yearly" && !!cashIncome?.units_in && cashIncome.units_in===cashFlow.units_in;
    const comparable=matched && last3.every((d)=>d && at(pat,d)>0 && at(cashrow,d)!==null);
    const cashSection=useParent?"parent_cash":"cash", incomeSection=useParent?"parent_income":"income";
    put("cash",comparable ? 100*last3.reduce((a,d)=>a+at(cashrow,d),0)/last3.reduce((a,d)=>a+at(pat,d),0):null,cashSection,`Sum of matched three annual operating cash flows / sum of PAT, same ${useParent?"standalone parent-company":"consolidated"} basis and units. Not free cash flow.`,latest);
    put("cashyears",comparable ? last3.filter((d)=>at(cashrow,d)>0).length:null,cashSection,"Number of the latest three matched annual periods with positive operating cash flow; capex is not deducted.",latest);
    if(now-(sections[incomeSection]?.fetched_at||0)>7*86400) for(const id of ["cash","cashyears"])known[id]={...known[id],value:null,reason:"Income download is stale; refresh needed"};
    if(stock.symbol==="M&M"&&!useParent)for(const id of ["cash","cashyears"])known[id]={...known[id],value:null,reason:"Parent-company cash statements required; consolidated lending cash flows are not used to judge automotive cash conversion"};
    const assets=row(balance,"Total Assets"), equity=row(balance,"Equity Capital"), bdate=dates(assets)[0];
    const a=at(assets,bdate), e=at(equity,bdate);
    const balanceOK=balance?.type==="consolidated" && balance?.time_period==="yearly";
    put("equityratio",balanceOK && a>0 && e!==null?100*e/a:null,"balance","Provider equity / total assets, same annual period. A solvency indicator; not debt/equity or regulatory capital adequacy.",bdate);
    const sustainable=known.roe.value, pb=known.pb.value;
    put("pbroe",sustainable>0&&pb>0?pb/(sustainable/10):null,"ratios","Provider P/B divided by (provider ROE% / 10); current reported ROE, not a sustainable ROE estimate.");
    const quote=sections.quote?.data, price=n(quote?.last_price), quoteFetched=sections.quote?.fetched_at;
    const tradeTime=n(quote?.last_trade_time), tradeAt=tradeTime>1e12?tradeTime/1000:tradeTime;
    const fiscalEPS=at(epsRow,latestEPSPeriod);
    const multipleDisagreement=known.pe.value>0&&price>0&&fiscalEPS>0?(price/fiscalEPS)/known.pe.value:1;
    let priceReason=!(price>0)?"Latest market quote unavailable":!quoteFetched||now-quoteFetched>1800?"Price download is older than 30 minutes; refresh prices":quoteFetched>now+300?"Price download timestamp is in the future":!tradeAt||now-tradeAt>7*86400||tradeAt>now+300?"Valid recent exchange trade timestamp required":!(fiscalEPS>0)?"Positive latest annual diluted EPS required":unresolvedEPS&&(multipleDisagreement>3||multipleDisagreement<1/3)?"Latest EPS / price basis needs review; current and reported multiples differ sharply":"";
    put("pricepe",priceReason?null:price/fiscalEPS,"income",`Latest traded price ₹${price??"unavailable"} / latest annual diluted EPS ₹${fiscalEPS??"unavailable"}. Annual fiscal earnings, not TTM or forecast earnings. Price source: Upstox full quote; trade time and download time shown separately.`,latestEPSPeriod);
    if(priceReason)known.pricepe={...known.pricepe,value:null,reason:priceReason};
    const weights=p.weights.map((w,i)=>i===4?40:w*60/(100-p.weights[4]));
    // Each available-data metric is explicitly named. Unavailable specialist
    // inputs retain weight in coverage, but do not become invented zero ratios.
    const specs={
      roce:["Reported ROCE","%",[0,8,14,20,28]],roe:["Reported ROE","%",[0,8,13,18,25]],roa:["Reported ROA","%",[0,.5,1,1.5,2]],
      pricepe:["Latest price / annual diluted EPS","×",p.metrics.find((m)=>m.id==="pe")?.anchors||(["Banks"].includes(model)?[35,25,18,12,8]:["Metals & mining","Energy","Cement"].includes(model)?[25,18,12,8,5]:[50,35,25,18,12])],
      sales:["3-year revenue CAGR","%",[-5,0,7,13,20]],eps:["3-year diluted EPS CAGR","%",[-10,0,8,15,25]],patgrowth:["3-year PAT CAGR","%",[-10,0,8,15,25]],
      quick:["Reported quick ratio","×",[0,.5,1,1.5,2]],equityratio:["Equity / total assets","%",[0,15,30,50,70]],cash:["3-year aggregate CFO / PAT","%",[0,50,80,100,120]],cashyears:["Positive operating-cash-flow years out of 3","years",[0,.75,1.5,2.25,3]],
      pe:["Reported P/E","×",[50,35,25,18,12]],ev:["Reported EV / EBITDA","×",[22,16,11,8,5]],pb:["Reported P/B","×",[5,3.5,2.5,1.5,.8]],pbroe:["P/B per 10% reported ROE","×",[4,3,2,1.3,.8]],
      npa:["Reported net NPA","%",[4,2,1,.5,.2]],nim:["Reported net interest margin","%",[0,2,3,4,5]],casa:["Reported CASA","%",[10,20,30,40,50]],
      capital:["Regulatory capital adequacy","%",[0,1,2,3,4]],credit:["Credit cost","%",[4,3,2,1,0]],alm:["Funding liquidity coverage","×",[0,1,2,3,4]],
      vnb:["Value of new business margin","%",[0,10,18,25,32]],evgrowth:["Operating return on embedded value","%",[0,6,10,15,20]],vnbg:["3-year VNB CAGR","%",[-10,0,8,15,25]],ape:["3-year APE CAGR","%",[-5,0,7,13,20]],solvency:["Insurance solvency","%",[0,1,2,3,4]],persist:["Premium persistency","%",[55,65,75,85,92]],persist61:["61st-month persistency","%",[30,40,50,60,75]],pev:["Price / embedded value","×",[5,4,3,2,1]],vnbmultiple:["(Market cap − embedded value) / VNB","×",[45,30,20,12,5]],dilution:["Diluted share-count CAGR","%",[12,7,3,1,0]]
    };
    let pairs=[["roce","roe"],["sales","eps"],["quick","equityratio"],["cash","cashyears"],["pe","ev"]];
    if(model==="Banks")pairs=[["roa","roe"],["patgrowth","eps"],["npa","capital"],["nim","casa"],["pbroe","pe"]];
    if(model==="Non-bank lenders")pairs=[["roa","roe"],["patgrowth","eps"],["npa","capital"],["credit","alm"],["pbroe","pe"]];
    if(model==="Life insurance")pairs=[["vnb","evgrowth"],["vnbg","ape"],["solvency","persist61"],["persist","dilution"],["pev","vnbmultiple"]];
    if(model!=="Life insurance")pairs[4]=["pricepe"];
    const rows=pairs.flatMap((pair,pillar)=>pair.map((id,i)=>{
      const [label,unit,defaultAnchors]=specs[id], reference=p.metrics.find((m)=>m.id===id);
      const anchors=reference?.anchors||defaultAnchors, obs=known[id]||{value:null,reason:"Not supplied by the connected Upstox responses; specialist disclosure needed",source:"Not mapped",detail:""};
      const value=obs.value, grade=value===null?null:NJScoring.grade(value,anchors), weight=pillar===4&&id==="pricepe"?40:weights[pillar]*(i?.4:.6);
      return {...obs,id,label,unit,anchors,pillar,weight,grade,points:grade===null?null:grade*weight/100};
    }));
    const coverage=rows.reduce((a,r)=>a+(r.grade===null?0:r.weight),0),earned=rows.reduce((a,r)=>a+(r.points||0),0);
    const groups=NJScoring.pillars.map((name,i)=>({name,weight:weights[i],covered:rows.filter((r)=>r.pillar===i&&r.grade!==null).reduce((a,r)=>a+r.weight,0),points:rows.filter((r)=>r.pillar===i).reduce((a,r)=>a+(r.points||0),0)}));
    const businessCovered=groups.slice(0,4).reduce((a,g)=>a+g.covered,0), businessEarned=groups.slice(0,4).reduce((a,g)=>a+g.points,0);
    const eligible=known.pricepe.value!==null&&coverage>=50 && rows.filter((r)=>r.grade!==null).length>=4 && groups.filter((g)=>g.covered>0).length>=3;
    let cap=100;
    const flags=["Automatic provider-data screen; governance and specialist risks are not fully assessed.","Reported ratios have no effective financial/price date in the response; retrieved dates are not reporting dates."];
    if(["Metals & mining","Cement","Energy","Automobiles","Aviation"].includes(model))flags.push("Current-period screen: margins and valuation have not been normalized across a business cycle.");
    if(["Banks","Non-bank lenders"].includes(model))flags.push("Loan growth, regulatory capital and funding-risk checks are incomplete; PAT/EPS growth is not loan-book growth.");
    if(coverage<80-1e-8 || groups.slice(0,4).some((g)=>g.covered===0)){cap=69;flags.push("Material data gap: provisional score capped at 69. Missing metrics earn no points; they are not assumed to be weak company fundamentals.");}
    if(adjustments.length)flags.push("EPS history adjusted for a confirmed share split/bonus; see the growth calculation.");
    if(unresolvedEPS)flags.push("Historical EPS share basis needs review: EPS CAGR is excluded rather than scored as an earnings collapse. Latest annual EPS is used separately for valuation unless its current price basis also fails the consistency check.");
    if(useParent)flags.push("M&M cash conversion uses matching standalone parent-company statements; other metrics remain provider-reported/consolidated as labelled.");
    if(known.npa.value!==null && known.npa.value>=4){cap=49;flags.push("Net NPA ≥4%: risk cap 49.");}
    if(known.equityratio.value!==null && known.equityratio.value<=0){cap=39;flags.push("Non-positive reported equity: risk cap 39.");}
    const rawScore=earned;
    const score=eligible?Math.round(Math.min(rawScore,cap)*10)/10:null;
    const otherData=model==="Life insurance"?Object.entries({roe:"Reported ROE",roa:"Reported ROA",pe:"Reported P/E",pb:"Reported P/B",eps:"3-year EPS CAGR",patgrowth:"3-year PAT CAGR"}).filter(([id])=>known[id]?.value!==null).map(([id,label])=>({...known[id],label,unit:["pe","pb"].includes(id)?"×":"%"})):[];
    const businessScore=businessCovered?Math.round(businessEarned/businessCovered*1000)/10:null;
    const valuationScore=groups[4].covered?Math.round(groups[4].points/40*1000)/10:null;
    return {automatic:true,version:"2.0",model,rows,groups,coverage:Math.round(coverage*10)/10,earned,rawScore,score,cap,flags,otherData,adjustments,businessScore,businessCovered,valuationScore,
      price:{value:price,tradeAt,fetched_at:quoteFetched,eps:fiscalEPS,period:latestEPSPeriod,multiple:known.pricepe.value,reason:priceReason},
      status:score===null?"Awaiting valid price / inputs":coverage<99.99?"Provisional · data gaps":"Price-aware screen",band:score===null?(model==="Life insurance"?"Insurance-specific inputs are not in these Upstox responses":priceReason||"Insufficient inputs for a price-aware score"):coverage<80?"Limited evidence — review missing inputs":valuationScore<25?"Valuation weighs on the score":businessScore>=70&&valuationScore>=65?"Strong observed fundamentals and supportive earnings valuation":"Review business strength and valuation separately",retrieved:Math.max(0,...Object.values(sections).map((s)=>s.fetched_at||0))};
  }
  return {evaluate};
})();
if(typeof module!=="undefined")module.exports=NJAutoScore;
