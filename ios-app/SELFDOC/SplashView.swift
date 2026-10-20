import UIKit

/// A copy of the launch screen, kept up until the first page has loaded (4 seconds at most), as in the Android app.
final class SplashView: UIView {
    private var hiding = false

    init(logo: String) {
        super.init(frame: .zero)
        backgroundColor = UIColor(named: "PageBackground")
        let image = UIImageView(image: UIImage(named: logo))
        image.translatesAutoresizingMaskIntoConstraints = false
        addSubview(image)
        // Centred on the whole screen, exactly where the system's launch screen shows it.
        NSLayoutConstraint.activate([
            image.centerXAnchor.constraint(equalTo: centerXAnchor),
            image.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("SplashView is built in code")
    }

    func hide() {
        guard !hiding, superview != nil else { return }
        hiding = true
        UIView.animate(withDuration: 0.25, animations: { self.alpha = 0 }, completion: { _ in self.removeFromSuperview() })
    }
}
