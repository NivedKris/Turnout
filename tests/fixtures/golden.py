import sys, json, warnings, pandas as pd
warnings.filterwarnings('ignore')
f=sys.argv[1]; R=lambda s: pd.read_excel(f, sheet_name=s)
p=R('People').drop_duplicates('person_id'); rg=R('Registrations').drop_duplicates('registration_id'); rh=R('Registration History').drop_duplicates('history_id'); ch=R('Check-ins').drop_duplicates('event_id'); li=R('Interest and Engagement').drop_duplicates('interaction_id'); d=R('Daily Marketing').drop_duplicates('activity_id')
ext=set(p[p.person_type=='external'].person_id)
def snap(asof):
    cut=pd.Timestamp(asof)+pd.Timedelta(hours=23,minutes=59,seconds=59,milliseconds=999)
    o={}
    pe=p[(p.person_type=='external')&(p.first_seen_at<=cut)]; o['identified']=len(pe)
    o['identified_campaign']=int((pe.first_touch_source=='campaign').sum())
    r=rg[(rg.registered_at<=cut)&rg.person_id.isin(ext)]; o['registrations']=len(r)
    dd=d[d.activity_date<=pd.Timestamp(asof)]
    for k,c in [('impressions','impressions'),('clicks','clicks'),('sessions','landing_page_sessions'),('starts','registration_starts'),('spend','marketing_spend_inr')]: o[k]=int(dd[c].sum())
    last=rh[rh.effective_at<=cut].sort_values(['effective_at','history_id']).groupby('registration_id').tail(1)
    last=last[last.registration_id.isin(r.registration_id)]
    o['status']=last.status.value_counts().to_dict()
    v=ch[(ch.occurred_at<=cut)&(ch.result=='admitted')&(ch.verification=='verified')&ch.person_id.isin(ext)]
    o['visitors']=v.person_id.nunique()
    hi=li[(li.occurred_at<=cut)&li.event_type.isin(['brochure_download','event_question_submitted','nurture_email_clicked','registration_start'])&li.person_id.isin(ext)]
    o['engaged']=hi.person_id.nunique()
    o['by_campaign']={c:{'regs':int((r.campaign_id==c).sum()),'spend':int(dd[dd.campaign_id==c].marketing_spend_inr.sum())} for c in sorted(d.campaign_id.unique())}
    # trailing 7 regs ending min(asof, 04-11)
    end=min(pd.Timestamp(asof),pd.Timestamp('2025-04-11')); st=end-pd.Timedelta(days=6)
    rr=r[(r.registered_at>=st)&(r.registered_at<end+pd.Timedelta(days=1))]
    o['regs_last7']=len(rr); o['regs_last7_by']=rr.campaign_id.value_counts().sort_index().to_dict()
    ds=dd[(dd.activity_date>=st)&(dd.activity_date<=end)]; o['spend_last7']=int(ds.marketing_spend_inr.sum())
    st14=end-pd.Timedelta(days=13); r14=r[(r.registered_at>=st14)&(r.registered_at<end+pd.Timedelta(days=1))]; d14=dd[(dd.activity_date>=st14)&(dd.activity_date<=end)]
    o['regs_last14']=len(r14); o['spend_last14']=int(d14.marketing_spend_inr.sum())
    o['last14_by']={c:{'regs':int((r14.campaign_id==c).sum()),'spend':int(d14[d14.campaign_id==c].marketing_spend_inr.sum())} for c in sorted(d.campaign_id.unique())}
    return o
out={a:snap(a) for a in ['2025-03-31','2025-04-20','2025-02-14']}
# confirmed at event start ext
cut=pd.Timestamp('2025-04-12 10:00'); last=rh[rh.effective_at<=cut].sort_values(['effective_at','history_id']).groupby('registration_id').tail(1)
extreg=rg[rg.person_id.isin(ext)]; out['confirmed_at_start']=int(((last.status=='confirmed')&last.registration_id.isin(extreg.registration_id)).sum())
print(json.dumps(out,indent=1,default=int))
