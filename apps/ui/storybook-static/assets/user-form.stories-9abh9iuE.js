import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{i,n as a,o,r as s,t as c}from"./rbac-B2RSQqSz.js";import{n as l,t as u}from"./user-form-BOiqweZ7.js";function d(e){let[t,n]=(0,f.useState)(),r=async t=>{n(t),await e.onSubmit(t)};return(0,p.jsxs)(`div`,{className:`w-full max-w-2xl space-y-4`,children:[(0,p.jsx)(u,{...e,onSubmit:r}),t?(0,p.jsxs)(`div`,{className:`rounded-xl border border-border/70 bg-card p-4`,children:[(0,p.jsx)(`p`,{className:`text-sm font-medium text-foreground`,children:`Last submitted`}),(0,p.jsx)(`pre`,{className:`mt-2 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground`,children:JSON.stringify(t,null,2)})]}):null]})}var f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D;t((()=>{f=e(n(),1),o(),l(),p=r(),{expect:m,fn:h,userEvent:g,within:_}=__STORYBOOK_MODULE_TEST__,v=[{id:i.viewer,name:c.Viewer,permissions:[{resource:a.User,verb:s.Read}]},{id:i.editor,name:c.Editor,permissions:[{resource:a.User,verb:s.Read},{resource:a.User,verb:s.Write}]},{id:i.admin,name:c.Admin,permissions:[{resource:a.User,verb:s.Read},{resource:a.User,verb:s.Write},{resource:a.User,verb:s.Delete}]}],y={title:`Resources/Users/Form`,component:u,parameters:{layout:`padded`},args:{mode:`create`,roles:v,defaultValues:{roleIds:[i.viewer]},onSubmit:h(async e=>{await new Promise(e=>setTimeout(e,300))}),onCancel:h()},render:e=>(0,p.jsx)(d,{...e})},b={},x={args:{mode:`edit`,defaultValues:{displayName:`Alice Example`,username:`alice`,email:`alice@example.com`,enabled:!0,password:``,roleIds:[i.viewer,i.editor]}}},S={args:{mode:`edit`,defaultValues:{displayName:`Alice Example`,username:`alice`,email:`alice@example.com`,enabled:!0,password:``,roleIds:[i.viewer,i.editor]},submitLabel:`Update account`}},C={play:async({canvasElement:e})=>{let t=_(e);await g.click(await t.findByRole(`button`,{name:/create user/i}))}},w={args:{onSubmit:h(async e=>{await new Promise(e=>setTimeout(e,4e3))})},play:async({canvasElement:e,args:t})=>{let n=_(e);await g.type(await n.findByLabelText(/display name/i),`Alice Example`),await g.type(await n.findByLabelText(/username/i),`alice`),await g.type(await n.findByLabelText(/email/i),`alice@example.com`),await g.type(await n.findByLabelText(/password/i),`correct horse battery staple`),await g.click(await n.findByRole(`button`,{name:/create user/i})),await m(t.onSubmit).toHaveBeenCalled()}},T={play:async({canvasElement:e,args:t})=>{let n=_(e),r=_(e.ownerDocument.body);await g.click(await n.findByRole(`combobox`,{name:/roles/i})),await g.type(await r.findByPlaceholderText(/search roles/i),`admin`),await g.click(await r.findByText(`admin`)),await m(await n.findByRole(`combobox`,{name:/roles/i})).toHaveTextContent(/viewer, admin/i),await m(t.onSubmit).not.toHaveBeenCalled()}},E={args:{mode:`edit`,defaultValues:{displayName:`Alice Example`,username:`alice`,email:`alice@example.com`,enabled:!0,password:``,roleIds:[i.viewer,i.editor]}},render:e=>(0,p.jsx)(`div`,{className:`dark rounded-2xl bg-background p-6`,children:(0,p.jsx)(d,{...e})})},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`[{
  id: builtInRoleIds.viewer,
  name: BuiltInRoleName.Viewer,
  permissions: [{
    resource: PermissionResource.User,
    verb: PermissionVerb.Read
  }]
}, {
  id: builtInRoleIds.editor,
  name: BuiltInRoleName.Editor,
  permissions: [{
    resource: PermissionResource.User,
    verb: PermissionVerb.Read
  }, {
    resource: PermissionResource.User,
    verb: PermissionVerb.Write
  }]
}, {
  id: builtInRoleIds.admin,
  name: BuiltInRoleName.Admin,
  permissions: [{
    resource: PermissionResource.User,
    verb: PermissionVerb.Read
  }, {
    resource: PermissionResource.User,
    verb: PermissionVerb.Write
  }, {
    resource: PermissionResource.User,
    verb: PermissionVerb.Delete
  }]
}]`,...v.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    mode: "edit",
    defaultValues: {
      displayName: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      password: "",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor]
    }
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    mode: "edit",
    defaultValues: {
      displayName: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      password: "",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor]
    },
    submitLabel: "Update account"
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", {
      name: /create user/i
    }));
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    onSubmit: fn(async _values => {
      await new Promise(resolve => setTimeout(resolve, 4000));
    })
  },
  play: async ({
    canvasElement,
    args
  }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText(/display name/i), "Alice Example");
    await userEvent.type(await canvas.findByLabelText(/username/i), "alice");
    await userEvent.type(await canvas.findByLabelText(/email/i), "alice@example.com");
    await userEvent.type(await canvas.findByLabelText(/password/i), "correct horse battery staple");
    await userEvent.click(await canvas.findByRole("button", {
      name: /create user/i
    }));
    await expect(args.onSubmit).toHaveBeenCalled();
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("combobox", {
      name: /roles/i
    }));
    await userEvent.type(await page.findByPlaceholderText(/search roles/i), "admin");
    await userEvent.click(await page.findByText("admin"));
    await expect(await canvas.findByRole("combobox", {
      name: /roles/i
    })).toHaveTextContent(/viewer, admin/i);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  }
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    mode: "edit",
    defaultValues: {
      displayName: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      password: "",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor]
    }
  },
  render: args => <div className="dark rounded-2xl bg-background p-6">
      <UserFormStoryShell {...args} />
    </div>
}`,...E.parameters?.docs?.source}}},D=[`ROLE_FIXTURES`,`Create`,`EditPrefilled`,`CustomSubmitLabel`,`ValidationErrors`,`Submitting`,`RoleSelection`,`DarkSurface`]}))();export{b as Create,S as CustomSubmitLabel,E as DarkSurface,x as EditPrefilled,v as ROLE_FIXTURES,T as RoleSelection,w as Submitting,C as ValidationErrors,D as __namedExportsOrder,y as default};