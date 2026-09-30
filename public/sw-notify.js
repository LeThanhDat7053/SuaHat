// Bấm vào thông báo báo thức → mở app đúng ngày trên Lịch đơn
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/lich', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => new URL(c.url).origin === self.location.origin)
      if (win)
        return win
          .navigate(url)
          .then((c) => (c || win).focus())
          .catch(() => win.focus())
      return self.clients.openWindow(url)
    }),
  )
})
