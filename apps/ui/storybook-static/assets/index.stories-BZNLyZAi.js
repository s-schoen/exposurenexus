import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{i,r as a}from"./role-fixtures-9ejvWuBf.js";import{n as o,t as s}from"./role-table-C5eVM9fC.js";function c({data:e,isFetching:t,isPending:n,refetch:r}){return{data:e,error:null,failureCount:0,failureReason:null,errorUpdateCount:0,isError:!1,isFetched:!n,isFetchedAfterMount:!n,isFetching:t,isInitialLoading:n,isLoading:n,isLoadingError:!1,isPaused:!1,isPending:n,isPlaceholderData:!1,isRefetchError:!1,isRefetching:t,isStale:!1,isSuccess:!n,status:n?`pending`:`success`,fetchStatus:t||n?`fetching`:`idle`,dataUpdatedAt:0,errorUpdatedAt:0,isEnabled:!0,promise:Promise.resolve(e??[]),refetch:r}}function l({roles:e,pending:t=!1,selectedRoleId:n,onSelectRole:r,onOpenRole:i,onCreateRole:a,onDeleteRoles:o}){let[l,f]=(0,u.useState)({globalFilter:``,selectFilters:{}});return(0,d.jsx)(`div`,{className:`w-full max-w-6xl`,children:(0,d.jsx)(s,{query:c({data:t?void 0:e,isFetching:!1,isPending:t,refetch:()=>Promise.resolve({data:e})}),selectedRoleId:n,onSelectRole:r,onOpenRole:i,onCreateRole:a,onDeleteRoles:o,filterState:l,onFilterStateChange:f})})}var u,d,f,p,m,h,g,_,v,y,b,x,S,C;t((()=>{u=e(n(),1),i(),o(),d=r(),{expect:f,fn:p,userEvent:m}=__STORYBOOK_MODULE_TEST__,h={title:`Resources/Roles/Table`,component:l,tags:[`!test`],parameters:{layout:`padded`},args:{roles:a},render:e=>(0,d.jsx)(l,{...e})},g={},_={args:{pending:!0}},v={args:{roles:[]}},y={args:{selectedRoleId:`0e7b7e25-47f2-4baf-a2c1-6ec48b0d8b03`}},b={args:{onCreateRole:p()},play:async({canvas:e,args:t})=>{await m.click(await e.findByRole(`button`,{name:/new role/i})),await f(t.onCreateRole).toHaveBeenCalled()}},x={args:{onDeleteRoles:p(()=>Promise.resolve())}},S={args:{onSelectRole:p(),onOpenRole:p()},play:async({canvas:e,args:t})=>{let n=await e.findByText(`security-auditor`);await m.click(n),await f(t.onSelectRole).toHaveBeenCalled(),await m.dblClick(n),await f(t.onOpenRole).toHaveBeenCalled()}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    pending: true
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    roles: []
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    selectedRoleId: "0e7b7e25-47f2-4baf-a2c1-6ec48b0d8b03"
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    onCreateRole: fn()
  },
  play: async ({
    canvas,
    args
  }) => {
    await userEvent.click(await canvas.findByRole("button", {
      name: /new role/i
    }));
    await expect(args.onCreateRole).toHaveBeenCalled();
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    onDeleteRoles: fn(() => Promise.resolve())
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    onSelectRole: fn(),
    onOpenRole: fn()
  },
  play: async ({
    canvas,
    args
  }) => {
    const rowLabel = await canvas.findByText("security-auditor");
    await userEvent.click(rowLabel);
    await expect(args.onSelectRole).toHaveBeenCalled();
    await userEvent.dblClick(rowLabel);
    await expect(args.onOpenRole).toHaveBeenCalled();
  }
}`,...S.parameters?.docs?.source}}},C=[`Default`,`Loading`,`Empty`,`ActiveRow`,`Creatable`,`Deletable`,`Selection`]}))();export{y as ActiveRow,b as Creatable,g as Default,x as Deletable,v as Empty,_ as Loading,S as Selection,C as __namedExportsOrder,h as default};