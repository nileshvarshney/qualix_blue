import NodeNetworkBg from '@/components/auth/NodeNetworkBg'
import LoginCard from '@/components/auth/LoginCard'

export default function LoginPage() {
  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <NodeNetworkBg />
      <LoginCard />
    </div>
  )
}
