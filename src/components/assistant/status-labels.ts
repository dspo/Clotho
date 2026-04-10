export function runtimeStatusLabel(status: string | null) {
  switch (status) {
    case 'streaming':
      return '流式输出';
    case 'running':
      return '运行中';
    case 'pending':
      return '待处理';
    case 'preview':
      return '预览';
    case 'applying':
      return '应用中';
    case 'applied':
      return '已应用';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    case 'expired':
      return '已过期';
    default:
      return status ?? '就绪';
  }
}

export function proposalStatusLabel(status: string | null) {
  switch (status) {
    case 'preview':
      return '待应用';
    case 'applying':
      return '应用中';
    case 'applied':
      return '已应用';
    case 'failed':
      return '失败';
    default:
      return status ?? '提案';
  }
}
