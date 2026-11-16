"""Analiza przeżycia bez zewnętrznych bibliotek: Kaplan-Meier i Weibull z obserwacjami uciętymi (prawostronnie)."""
import numpy as np
from scipy.optimize import minimize


def _km(t, e):
    t = np.asarray(t, float); e = np.asarray(e, int)
    u, d = np.unique(t[e == 1], return_counts=True)
    n_ryz = len(t) - np.searchsorted(np.sort(t), u, 'left')
    return u, np.cumprod(1 - d / n_ryz)


def km(t, e, czasy):
    """S(t) Kaplana-Meiera w podanych czasach. t: czas, e: 1 = zdarzenie, 0 = ucięte."""
    u, s = _km(t, e)
    i = np.searchsorted(u, np.asarray(czasy, float), 'right') - 1
    return np.where(i >= 0, s[np.clip(i, 0, None)], 1.0)


def km_mediana(t, e):
    u, s = _km(t, e)
    return u[np.argmax(s <= 0.5)] if (s <= 0.5).any() else np.inf


def weibull(t, e):
    """MLE Weibulla z ucięciem: S(t) = exp(-(t/lam)^k). Zwraca k, lam, logL; oraz logL wykładniczego (k = 1)."""
    t = np.asarray(t, float); e = np.asarray(e, int)
    def nll(p, k_staly=None):
        k = np.exp(p[0]) if k_staly is None else k_staly; lam = np.exp(p[-1])
        z = (t / lam) ** k
        return -(np.sum(e * (np.log(k) - np.log(lam) + (k - 1) * np.log(t / lam))) - np.sum(z))
    r = minimize(nll, [0.0, np.log(np.mean(t))], method='Nelder-Mead', options={'xatol': 1e-6, 'fatol': 1e-6, 'maxiter': 2000})
    r1 = minimize(lambda p: nll(p, 1.0), [np.log(np.mean(t))], method='Nelder-Mead')
    return np.exp(r.x[0]), np.exp(r.x[1]), -r.fun, -r1.fun


if __name__ == '__main__':
    rng = np.random.default_rng(1)
    t = 20 * rng.weibull(0.7, 20000); cen = rng.uniform(0, 80, 20000)
    obs = np.minimum(t, cen); e = (t <= cen).astype(int)
    k, lam, ll, ll1 = weibull(obs, e)
    print('test Weibull: k = %.3f (prawda 0,7), lam = %.2f (prawda 20), LR = %.0f' % (k, lam, 2 * (ll - ll1)))
    print('test KM S(20) = %.3f, prawda %.3f' % (km(obs, e, [20])[0], np.exp(-1)))
