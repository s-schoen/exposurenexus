import{n as e}from"./chunk-DnJy8xQt.js";import{t}from"./jsx-runtime-BX9360Lk.js";import{h as n,p as r}from"./format-DghQRabq.js";import{n as i,t as a}from"./severity-badge-DhCOwdot.js";var o,s,c,l,u,d,f,p,m,h,g;e((()=>{n(),i(),o=t(),s={title:`Components/SeverityBadge`,component:a,parameters:{layout:`centered`},args:{severity:r.Medium},argTypes:{severity:{control:`select`,options:Object.values(r)}}},c={},l={args:{severity:r.Info}},u={args:{severity:r.Low}},d={args:{severity:r.Medium}},f={args:{severity:r.High}},p={args:{severity:r.Critical}},m={render:()=>(0,o.jsx)(`div`,{className:`flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-6`,children:Object.values(r).map(e=>(0,o.jsx)(a,{severity:e},e))})},h={render:()=>(0,o.jsx)(`div`,{className:`dark rounded-xl border border-border bg-background p-6`,children:(0,o.jsx)(`div`,{className:`flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-6`,children:Object.values(r).map(e=>(0,o.jsx)(a,{severity:e},e))})})},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    severity: VulnerabilitySeverity.Info
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    severity: VulnerabilitySeverity.Low
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    severity: VulnerabilitySeverity.Medium
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    severity: VulnerabilitySeverity.High
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    severity: VulnerabilitySeverity.Critical
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-6">
      {Object.values(VulnerabilitySeverity).map(severity => <SeverityBadge key={severity} severity={severity} />)}
    </div>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <div className="dark rounded-xl border border-border bg-background p-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-6">
        {Object.values(VulnerabilitySeverity).map(severity => <SeverityBadge key={severity} severity={severity} />)}
      </div>
    </div>
}`,...h.parameters?.docs?.source}}},g=[`Default`,`Info`,`Low`,`Medium`,`High`,`Critical`,`AllSeverities`,`DarkSurface`]}))();export{m as AllSeverities,p as Critical,h as DarkSurface,c as Default,f as High,l as Info,u as Low,d as Medium,g as __namedExportsOrder,s as default};