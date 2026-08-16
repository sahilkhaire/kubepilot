import { NavLink, Outlet } from 'react-router-dom'

const tabStyle = ({ isActive }: { isActive: boolean }) => ({
  marginRight: '1rem',
  fontWeight: isActive ? 'bold' : 'normal',
})

export default function SettingsLayout() {
  return (
    <div style={{ maxWidth: '56rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Settings</h1>
      <nav style={{ marginBottom: '1.5rem' }}>
        <NavLink to="/settings/members" style={tabStyle}>Members</NavLink>
        <NavLink to="/settings/sets" style={tabStyle}>Permission sets</NavLink>
        <NavLink to="/settings/audit" style={tabStyle}>Audit</NavLink>
        <NavLink to="/settings/app" style={tabStyle}>App</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
