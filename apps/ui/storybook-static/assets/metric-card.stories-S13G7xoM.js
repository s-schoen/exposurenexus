import{n as e}from"./chunk-DnJy8xQt.js";import{t}from"./jsx-runtime-BX9360Lk.js";import{b as n,p as r,st as i,t as a}from"./lucide-react-gLHBi0xA.js";import{n as o,t as s}from"./metric-card-CmIA_aYM.js";var c,l,u,d,f,p,m,h,g,_;e((()=>{a(),o(),c=t(),l={title:`Components/MetricCard`,component:s,parameters:{layout:`padded`},args:{title:`Critical / high`,value:12,description:`Highest severity exposure right now`,icon:r}},u={args:{variant:`card`}},d={args:{title:`Mitigated rate`,value:`84%`,description:`Share of findings already mitigated`,icon:i,variant:`panel`}},f={args:{emphasis:!0}},p={args:{loading:!0}},m={args:{title:`Affected assets`,value:37,description:`Assets with at least one linked finding`,showIcon:!1}},h={render:()=>(0,c.jsxs)(`div`,{className:`grid gap-4 md:grid-cols-2 xl:grid-cols-3`,children:[(0,c.jsx)(s,{title:`Total findings`,value:148,description:`Current finding volume across all sources`,icon:i}),(0,c.jsx)(s,{title:`Critical / high`,value:12,description:`Highest severity exposure right now`,icon:r,emphasis:!0}),(0,c.jsx)(s,{title:`Affected assets`,value:37,description:`27% of tracked assets currently have linked findings`,icon:n}),(0,c.jsx)(s,{title:`Healthy assets`,value:99,description:`Assets without any linked findings`,variant:`panel`}),(0,c.jsx)(s,{title:`Mitigated rate`,value:`84%`,description:`Share of findings already mitigated`,icon:r,variant:`panel`}),(0,c.jsx)(s,{title:`Source diversity`,value:6,description:`Distinct inputs currently feeding the platform`,icon:n,variant:`panel`})]})},g={render:()=>(0,c.jsx)(`div`,{className:`dark rounded-2xl bg-background p-6`,children:(0,c.jsxs)(`div`,{className:`grid gap-4 md:grid-cols-2`,children:[(0,c.jsx)(s,{title:`Critical / high`,value:12,description:`Highest severity exposure right now`,icon:r,emphasis:!0}),(0,c.jsx)(s,{title:`Mitigated rate`,value:`84%`,description:`Share of findings already mitigated`,icon:i,variant:`panel`})]})})},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    variant: "card"
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    title: "Mitigated rate",
    value: "84%",
    description: "Share of findings already mitigated",
    icon: Activity,
    variant: "panel"
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    emphasis: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    loading: true
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    title: "Affected assets",
    value: 37,
    description: "Assets with at least one linked finding",
    showIcon: false
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MetricCard title="Total findings" value={148} description="Current finding volume across all sources" icon={Activity} />
      <MetricCard title="Critical / high" value={12} description="Highest severity exposure right now" icon={ShieldAlert} emphasis={true} />
      <MetricCard title="Affected assets" value={37} description="27% of tracked assets currently have linked findings" icon={Radar} />
      <MetricCard title="Healthy assets" value={99} description="Assets without any linked findings" variant="panel" />
      <MetricCard title="Mitigated rate" value="84%" description="Share of findings already mitigated" icon={ShieldAlert} variant="panel" />
      <MetricCard title="Source diversity" value={6} description="Distinct inputs currently feeding the platform" icon={Radar} variant="panel" />
    </div>
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <div className="dark rounded-2xl bg-background p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard title="Critical / high" value={12} description="Highest severity exposure right now" icon={ShieldAlert} emphasis={true} />
        <MetricCard title="Mitigated rate" value="84%" description="Share of findings already mitigated" icon={Activity} variant="panel" />
      </div>
    </div>
}`,...g.parameters?.docs?.source}}},_=[`Default`,`Panel`,`Emphasis`,`Loading`,`WithoutIcon`,`OverviewGrid`,`DarkSurface`]}))();export{g as DarkSurface,u as Default,f as Emphasis,p as Loading,h as OverviewGrid,d as Panel,m as WithoutIcon,_ as __namedExportsOrder,l as default};